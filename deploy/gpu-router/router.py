"""Ollama router: send chat to a Kaggle GPU while one is registered, else to the local Ollama.

The RAG service talks to this as if it were Ollama (port 11434). Embeddings always go to the
local Ollama so new vectors match the ones already stored. A Kaggle notebook registers its
tunnel URL on port 8080 (POST /gpu/register, Bearer GPU_TOKEN) and repeats it as a heartbeat;
the reply tells it how long chat has been idle so it can shut itself down.

On-demand GPU: when a chat arrives and no GPU is registered, the router starts the Kaggle
notebook with `kaggle kernels push`. It needs a Kaggle API token in KAGGLE_CONFIG_DIR, either
`access_token` (new KGAT_ tokens) or a legacy `kaggle.json`. Without one, the router simply
keeps using the local model.
"""
import hmac
import http.client
import json
import os
import subprocess
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCAL = os.environ.get("LOCAL_OLLAMA", "http://ollama:11434")
TOKEN = os.environ.get("GPU_TOKEN", "")
HEARTBEAT_TTL = 600  # seconds without a heartbeat before the GPU is considered gone
START_COOLDOWN = 900  # don't re-launch Kaggle more often than this while one is booting
KERNEL_DIR = os.environ.get("KAGGLE_KERNEL_DIR", "/app/kernel")
GPU_PATHS = ("/api/chat", "/api/generate")
HOP_HEADERS = {"connection", "transfer-encoding", "content-length", "keep-alive", "host"}

state = {"url": None, "model": None, "seen": 0.0, "last_chat": 0.0, "start_requested": 0.0}
lock = threading.Lock()


def gpu():
    with lock:
        if state["url"] and time.time() - state["seen"] < HEARTBEAT_TTL:
            return state["url"], state["model"]
    return None, None


def drop_gpu():
    with lock:
        state["url"] = None


KAGGLE_DIR = os.environ.get("KAGGLE_CONFIG_DIR", os.path.expanduser("~/.kaggle"))


def kaggle_env():
    """Environment for the kaggle CLI, or None when no token is configured."""
    token_file = os.path.join(KAGGLE_DIR, "access_token")
    if os.path.exists(token_file):
        with open(token_file) as f:
            token = f.read().strip()
        # kaggle 1.7 still insists on a username/key before it uses KAGGLE_API_TOKEN.
        return {**os.environ, "KAGGLE_API_TOKEN": token, "KAGGLE_KEY": token,
                "KAGGLE_USERNAME": os.environ.get("KAGGLE_USERNAME", "hadikhanhk")}
    if os.path.exists(os.path.join(KAGGLE_DIR, "kaggle.json")):
        return dict(os.environ)
    return None


def maybe_start_gpu():
    """Launch the Kaggle notebook in the background if chat is used and no GPU is up."""
    with lock:
        now = time.time()
        env = kaggle_env()
        if env is None or now - state["start_requested"] < START_COOLDOWN:
            return
        state["start_requested"] = now

    def push():
        result = subprocess.run(["kaggle", "kernels", "push", "-p", KERNEL_DIR],
                                capture_output=True, text=True, timeout=120, env=env)
        print("kaggle push:", result.returncode, (result.stdout + result.stderr).strip()[-300:], flush=True)

    threading.Thread(target=push, daemon=True).start()


def open_upstream(base, method, path, body, headers, timeout):
    u = urllib.parse.urlsplit(base)
    conn_cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(u.netloc, timeout=timeout)
    conn.request(method, path, body=body, headers=headers)
    return conn.getresponse()


class OllamaProxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # close-delimited bodies keep streaming simple

    def _relay(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)) or None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        url, model = gpu()
        resp = None
        if self.path.startswith(GPU_PATHS):
            with lock:
                state["last_chat"] = time.time()
            if not url:
                maybe_start_gpu()
        if url and self.path.startswith(GPU_PATHS):
            try:
                gpu_body = body
                if body and model:
                    payload = json.loads(body)
                    payload["model"] = model
                    gpu_body = json.dumps(payload).encode()
                resp = open_upstream(url, self.command, self.path, gpu_body,
                                     {**headers, "Authorization": f"Bearer {TOKEN}"}, timeout=300)
                if resp.status >= 500 or resp.status in (401, 403, 404):
                    raise OSError(f"gpu returned {resp.status}")
            except (OSError, ValueError, http.client.HTTPException) as e:
                self.log_message("GPU failed (%s); falling back to local", e)
                drop_gpu()
                resp = None
        if resp is None:
            resp = open_upstream(LOCAL, self.command, self.path, body, headers, timeout=600)
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in HOP_HEADERS:
                self.send_header(k, v)
        self.end_headers()
        while chunk := resp.read1(65536):
            self.wfile.write(chunk)
            self.wfile.flush()

    do_GET = do_POST = do_DELETE = do_HEAD = _relay


class Admin(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url, model = gpu()
        with lock:
            booting = not url and time.time() - state["start_requested"] < START_COOLDOWN
        self._send(200, {"gpu": bool(url), "model": model if url else None, "starting": booting})

    def do_POST(self):
        if self.path != "/gpu/register":
            return self._send(404, {"error": "not found"})
        auth = self.headers.get("Authorization", "")
        if not TOKEN or not hmac.compare_digest(auth, f"Bearer {TOKEN}"):
            return self._send(401, {"error": "unauthorized"})
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
            url = data["url"].rstrip("/")
            if not url.startswith("https://"):
                raise ValueError("url must be https")
        except (ValueError, KeyError, TypeError) as e:
            return self._send(400, {"error": str(e)})
        with lock:
            state.update(url=url, model=data.get("model"), seen=time.time())
            idle = int(time.time() - state["last_chat"]) if state["last_chat"] else None
        # The notebook shuts itself down once chat has been idle long enough.
        self._send(200, {"ok": True, "idle_seconds": idle})


if __name__ == "__main__":
    threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", 8080), Admin).serve_forever, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 11434), OllamaProxy).serve_forever()
