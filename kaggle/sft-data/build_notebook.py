"""Writes citewise-sft-data.ipynb: turns docs + case studies into Q&A training pairs on Kaggle.

Run `python build_notebook.py` after editing the cells below; push with
`kaggle kernels push -p kaggle/sft-data`.
"""
import json
import pathlib

CELLS = [
("markdown", """# Citewise SFT data: docs + case studies -> Q&A pairs

A teacher model (`qwen2.5-coder:14b`, one copy per T4) reads documentation sections and case studies
and writes grounded question/answer pairs. Output: `train.jsonl` and `eval.jsonl` in `/kaggle/working`,
used by the `citewise-sft-train` notebook. Private, non-commercial use."""),

("code", """TEACHER = "qwen2.5-coder:14b"
TIME_BUDGET_H = 3.3          # stop generating and save before Kaggle's limits
PAIRS_PER_CHUNK = 3
EVAL_FRACTION = 0.05
CHUNK_CHARS = 2400

# (name, repo, sparse paths, glob, max chunks)
SOURCES = [
    ("nodejs",     "nodejs/node",                    ["doc/api"],                         "doc/api/*.md",                          300),
    ("nestjs",     "nestjs/docs.nestjs.com",         ["content"],                         "content/**/*.md",                       200),
    ("express",    "expressjs/expressjs.com",        ["src/content/docs/en", "src/content/api/5x"], "src/content/**/*.md*",  100),
    ("typescript", "microsoft/TypeScript-Website",   ["packages/documentation/copy/en/handbook-v2"], "packages/documentation/copy/en/handbook-v2/**/*.md", 120),
    ("postgres",   "postgres/postgres",              ["doc/src/sgml"],                    "doc/src/sgml/*.sgml",                   250),
    ("redis",      "redis/docs",                     ["content/develop"],                 "content/develop/**/*.md",               150),
    ("system-design", "donnemartin/system-design-primer", ["README.md", "solutions"],     "**/README.md",                          80),
    ("own-projects", None, None, None, 40),   # hadikhanhk786 repos: READMEs + docs as real case studies
]
OWN_REPOS = ["hadikhanhk786/citewise", "hadikhanhk786/docnudge", "hadikhanhk786/ecom-app"]"""),

("code", """# Two Ollama servers, one per T4, so generation runs twice as fast.
import os, subprocess, time, urllib.request
subprocess.run("apt-get -qq install -y zstd > /dev/null && curl -fsSL https://ollama.com/install.sh | sh > /dev/null", shell=True, check=True)
PORTS = [11434, 11435]
for gpu, port in enumerate(PORTS):
    env = {**os.environ, "CUDA_VISIBLE_DEVICES": str(gpu), "OLLAMA_HOST": f"127.0.0.1:{port}",
           "OLLAMA_KEEP_ALIVE": "-1", "OLLAMA_NUM_PARALLEL": "2"}
    subprocess.Popen(["ollama", "serve"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for port in PORTS:
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/version"); break
        except OSError:
            time.sleep(1)
subprocess.run(["ollama", "pull", TEACHER], env={**os.environ, "OLLAMA_HOST": f"127.0.0.1:{PORTS[0]}"}, check=True)
print("teacher ready")"""),

("code", """# Fetch sources (sparse, shallow clones) and split into heading-based chunks.
import glob, random, re, html
random.seed(7)
os.makedirs("/tmp/src", exist_ok=True)

def clone(repo, paths):
    d = f"/tmp/src/{repo.replace('/', '__')}"
    if not os.path.exists(d):
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse",
                        f"https://github.com/{repo}.git", d], check=True)
        if paths:
            subprocess.run(["git", "-C", d, "sparse-checkout", "set", "--no-cone", *["/" + p for p in paths]], check=True)
    return d

def clean(text, path):
    if path.endswith(".sgml"):
        text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
        text = re.sub(r"<(programlisting|screen)[^>]*>(.*?)</\\1>", lambda m: "\\n```\\n" + m.group(2) + "\\n```\\n", text, flags=re.S)
        text = re.sub(r"<title>(.*?)</title>", lambda m: "\\n## " + m.group(1) + "\\n", text, flags=re.S)
        text = re.sub(r"<[^>]+>", "", text)
        text = html.unescape(text)
        text = "\\n".join(l.strip() for l in text.splitlines())                   # drop markup indentation
    text = re.sub(r"^---\\n.*?\\n---\\n", "", text, flags=re.S)          # front matter
    text = re.sub(r"^(import|export) .*$", "", text, flags=re.M)         # mdx
    return re.sub(r"\\n{3,}", "\\n\\n", text).strip()

def chunks(text):
    # Pack headings' sections, then paragraphs, up to CHUNK_CHARS; never cut inside a paragraph.
    paras = [p for block in re.split(r"(?m)^(?=#{1,3} )", text) for p in re.split(r"\\n\\s*\\n", block)]
    parts, cur = [], ""
    for p in paras:
        if len(cur) + len(p) > CHUNK_CHARS and cur:
            parts.append(cur); cur = ""
        cur += p + "\\n\\n"
    if cur.strip():
        parts.append(cur)
    return [p.strip() for p in parts if len(p) > 400]

items = []
for name, repo, paths, pattern, cap in SOURCES:
    found = []
    repos = OWN_REPOS if repo is None else [repo]
    for r in repos:
        d = clone(r, paths)
        files = sorted(glob.glob(f"{d}/{pattern}", recursive=True)) if pattern else \\
                sorted(glob.glob(f"{d}/README.md") + glob.glob(f"{d}/**/README.md", recursive=True) + glob.glob(f"{d}/docs/**/*.md", recursive=True))
        for f in files:
            if "node_modules" in f:
                continue
            rel = f[len(d) + 1:]
            for c in chunks(clean(open(f, errors="ignore").read(), f)):
                found.append({"source": name, "repo": r, "file": rel, "text": c})
    random.shuffle(found)
    items += found[:cap]
    print(f"{name:14} {len(found):5} chunks, using {min(cap, len(found))}")
random.shuffle(items)
print("total chunks:", len(items))"""),

("code", """# Generate grounded Q&A pairs in parallel across both GPUs; append as we go so a cut-off run keeps its work.
import json, itertools
from concurrent.futures import ThreadPoolExecutor, as_completed

PROMPT = '''You are a senior software engineer writing training data for a coding assistant.
Read the source below ({source}: {file}) and write {n} question/answer pairs a working backend
engineer might ask, answered ONLY from this source:
1. a precise factual question (API, option, behaviour, limit),
2. a practical "how do I ..." question answered with a short, correct code example,
3. an applied scenario (debugging, performance, design trade-off) that this source helps solve.
Answers must be accurate, specific and self-contained (do not say "the source" or "the text").
Return JSON: {{"pairs": [{{"question": "...", "answer": "..."}}]}}

SOURCE:
{text}'''

def ask(item, port):
    body = {"model": TEACHER, "stream": False, "format": "json", "options": {"temperature": 0.4, "num_ctx": 6144},
            "messages": [{"role": "user", "content": PROMPT.format(n=PAIRS_PER_CHUNK, **item)}]}
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        pairs = json.loads(json.load(r)["message"]["content"]).get("pairs", [])
    return [{"source": item["source"], "file": item["file"], "question": p["question"].strip(), "answer": p["answer"].strip()}
            for p in pairs if isinstance(p, dict) and len(str(p.get("answer", ""))) > 80]

deadline = time.time() + TIME_BUDGET_H * 3600
done = ok = 0
ports = itertools.cycle(PORTS)
with open("/kaggle/working/pairs.jsonl", "w") as out, ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(ask, it, next(ports)): it for it in items}
    for fut in as_completed(futures):
        done += 1
        try:
            for p in fut.result():
                out.write(json.dumps(p) + "\\n"); ok += 1
            out.flush()
        except Exception as e:
            print("skip:", str(e)[:120])
        if done % 50 == 0:
            print(f"{done}/{len(items)} chunks, {ok} pairs", flush=True)
        if time.time() > deadline:
            print("time budget reached; stopping"); pool.shutdown(wait=False, cancel_futures=True); break
print("pairs:", ok)"""),

("code", """# Split by source file so eval questions come from files the model never trained on.
rows = [json.loads(l) for l in open("/kaggle/working/pairs.jsonl")]
files = sorted({(r["source"], r["file"]) for r in rows}); random.shuffle(files)
held = set(files[: max(1, int(len(files) * EVAL_FRACTION))])
SYSTEM = "You are a senior software engineer. Answer precisely, with correct code where useful."
def to_chat(r):
    return {"messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": r["question"]},
                         {"role": "assistant", "content": r["answer"]}], "source": r["source"]}
with open("/kaggle/working/train.jsonl", "w") as tr, open("/kaggle/working/eval.jsonl", "w") as ev:
    for r in rows:
        (ev if (r["source"], r["file"]) in held else tr).write(json.dumps(to_chat(r)) + "\\n")
from collections import Counter
print("train", sum(1 for _ in open("/kaggle/working/train.jsonl")), "| eval", sum(1 for _ in open("/kaggle/working/eval.jsonl")))
print(Counter(r["source"] for r in rows))"""),
]

nb = {"cells": [{"cell_type": t, "metadata": {}, "source": s.splitlines(True),
                 **({"outputs": [], "execution_count": None} if t == "code" else {})} for t, s in CELLS],
      "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
here = pathlib.Path(__file__).parent
(here / "citewise-sft-data.ipynb").write_text(json.dumps(nb, indent=1))
(here / "kernel-metadata.json").write_text(json.dumps({
    "id": "hadikhanhk/citewise-sft-data", "title": "citewise-sft-data", "code_file": "citewise-sft-data.ipynb",
    "language": "python", "kernel_type": "notebook", "is_private": True, "enable_gpu": True,
    "enable_internet": True, "dataset_sources": [], "competition_sources": [], "kernel_sources": []}, indent=2))
for c in nb["cells"]:
    if c["cell_type"] == "code":
        compile("".join(c["source"]), "cell", "exec")
print("wrote", here / "citewise-sft-data.ipynb")
