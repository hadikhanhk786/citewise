"""Index the shared docs library (deploy/library) into rag_chunks.

Usage (inside the rag container, library mounted at /library):
    python -m scripts.build_library            # index new files only (resumable)
    python -m scripts.build_library --rebuild  # drop and re-index everything

Chunks go to the shared LIBRARY_WORKSPACE_ID as NOTES sources ("lib:<name>"),
so chat in HYBRID/NOTES mode searches them for every user.
"""
import asyncio
import glob
import html
import os
import re
import sys
import time

from sqlalchemy import delete, select

from app.config import settings
from app.db.models import RagChunk
from app.db.session import AsyncSessionLocal
from app.services.embedding import EmbeddingService

LIBRARY = os.getenv("LIBRARY_DIR", "/library")
CHUNK_CHARS = 2000
BATCH = 16


def clean(text: str, path: str) -> str:
    if path.endswith(".sgml"):
        text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
        text = re.sub(r"<(programlisting|screen)[^>]*>(.*?)</\1>", lambda m: "\n```\n" + m.group(2) + "\n```\n", text, flags=re.S)
        text = re.sub(r"<title>(.*?)</title>", lambda m: "\n## " + m.group(1) + "\n", text, flags=re.S)
        text = html.unescape(re.sub(r"<[^>]+>", "", text))
        text = "\n".join(line.strip() for line in text.splitlines())
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)       # front matter
    text = re.sub(r"^(import|export) .*$", "", text, flags=re.M)      # mdx
    text = re.sub(r"<img[^>]*>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def chunks(text: str) -> list[str]:
    """Pack sections then paragraphs up to CHUNK_CHARS without cutting a paragraph."""
    paras = [p for block in re.split(r"(?m)^(?=#{1,3} )", text) for p in re.split(r"\n\s*\n", block)]
    parts, cur = [], ""
    for p in paras:
        if len(cur) + len(p) > CHUNK_CHARS and cur:
            parts.append(cur)
            cur = ""
        cur += p + "\n\n"
        while len(cur) > CHUNK_CHARS * 2:               # one giant paragraph (e.g. a long code block)
            parts.append(cur[:CHUNK_CHARS])
            cur = cur[CHUNK_CHARS:]
    if cur.strip():
        parts.append(cur)
    return [p.strip() for p in parts if len(p.strip()) > 200]


def sources():
    for line in open(os.path.join(LIBRARY, "sources.txt")):
        if line.strip() and not line.startswith("#"):
            name, label, repo, _paths, pattern = [f.strip() for f in line.split("|")]
            yield name, label, repo, pattern


async def main(rebuild: bool):
    ws = settings.LIBRARY_WORKSPACE_ID
    embedder = EmbeddingService()
    started, total = time.time(), 0
    for name, label, repo, pattern in sources():
        root = os.path.join(LIBRARY, "repos", name)
        files = [f for f in sorted(glob.glob(os.path.join(root, pattern), recursive=True))
                 if "node_modules" not in f and os.path.isfile(f)]
        source_id = f"lib:{name}"
        async with AsyncSessionLocal() as db:
            if rebuild:
                await db.execute(delete(RagChunk).where(RagChunk.workspace_id == ws, RagChunk.source_id == source_id))
                await db.commit()
            done = set((await db.execute(select(RagChunk.doc_id).where(
                RagChunk.workspace_id == ws, RagChunk.source_id == source_id).distinct())).scalars())
        todo = [f for f in files if os.path.relpath(f, root) not in done]
        print(f"{name}: {len(files)} files, {len(todo)} to index", flush=True)
        for f in todo:
            rel = os.path.relpath(f, root)
            parts = chunks(clean(open(f, errors="ignore").read(), f))
            if not parts:
                continue
            vectors = []
            for i in range(0, len(parts), BATCH):
                vectors += embedder.embed_documents(parts[i:i + BATCH])
            title = f"{label} › {os.path.splitext(os.path.basename(rel))[0]}"
            url = f"https://github.com/{repo}/blob/HEAD/{rel}"
            async with AsyncSessionLocal() as db:
                db.add_all([RagChunk(workspace_id=ws, source_type="NOTES", source_id=source_id, doc_id=rel,
                                     chunk_index=i, content=text, embedding=vec,
                                     metadata_={"title": title, "url": url, "library": name})
                            for i, (text, vec) in enumerate(zip(parts, vectors))])
                await db.commit()
            total += len(parts)
            print(f"  {rel}: {len(parts)} chunks ({total} total, {total / (time.time() - started):.2f}/s)", flush=True)
    print(f"done: {total} chunks in {(time.time() - started) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    asyncio.run(main("--rebuild" in sys.argv))
