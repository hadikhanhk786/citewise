"""Live web search via the self-hosted SearXNG container (no API key).

Returns chunk-like objects so the chat prompt and citations treat web pages
like any other source. Standard library only.
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from types import SimpleNamespace

SEARXNG_URL = os.getenv("SEARXNG_URL", "http://searxng:8080")
MAX_PAGES = 3
PAGE_CHARS = 1500
MAX_BYTES = 1_500_000
UA = "Mozilla/5.0 (compatible; CitewiseBot/1.0)"
SKIP_TAGS = {"script", "style", "nav", "footer", "header", "aside", "noscript", "svg", "form"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.skip, self.title, self._in_title = [], 0, "", False

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag in ("p", "li", "pre", "h1", "h2", "h3", "tr", "br", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self.skip:
            self.parts.append(data)


def _get(url: str, timeout: float) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(MAX_BYTES)


def _best_text(text: str, query: str) -> str:
    """Keep the paragraphs that share the most words with the question, in page order."""
    words = {w for w in re.findall(r"[a-z0-9_.]{3,}", query.lower())}
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if len(p.strip()) > 60]
    ranked = sorted(range(len(paras)), key=lambda i: -len(words & set(re.findall(r"[a-z0-9_.]{3,}", paras[i].lower()))))
    keep, size = set(), 0
    for i in ranked:
        if size + len(paras[i]) > PAGE_CHARS:
            continue
        keep.add(i)
        size += len(paras[i])
    return "\n\n".join(paras[i] for i in sorted(keep))


def html_to_text(raw: str) -> tuple[str, str]:
    """(title, readable text) of an HTML page."""
    parser = _Text()
    try:
        parser.feed(raw)
    except Exception:
        pass
    return parser.title.strip(), re.sub(r"[ \t]+", " ", "".join(parser.parts))


def fetch_url(url: str) -> bytes:
    return _get(url, timeout=15)


def _page(result: dict, query: str):
    try:
        raw = _get(result["url"], timeout=6).decode("utf-8", errors="ignore")
    except Exception:
        raw = ""
    parser = _Text()
    try:
        parser.feed(raw)
    except Exception:
        pass
    text = _best_text(re.sub(r"[ \t]+", " ", "".join(parser.parts)), query) or result.get("content", "")
    if not text:
        return None
    title = (result.get("title") or parser.title or result["url"]).strip()
    return SimpleNamespace(source_type="WEB", source_id=result["url"], doc_id=result["url"], chunk_index=0,
                           content=text, metadata_={"title": title, "url": result["url"]})


def web_search(query: str) -> list:
    """Top MAX_PAGES pages for the query as chunk-like objects; [] if search is unavailable."""
    try:
        data = json.loads(_get(f"{SEARXNG_URL}/search?" + urllib.parse.urlencode(
            {"q": query, "format": "json", "language": "en"}), timeout=8))
    except Exception:
        return []
    results = [r for r in data.get("results", []) if r.get("url", "").startswith("http")][:MAX_PAGES]
    with ThreadPoolExecutor(max_workers=MAX_PAGES) as pool:
        pages = list(pool.map(lambda r: _page(r, query), results))
    return [p for p in pages if p]
