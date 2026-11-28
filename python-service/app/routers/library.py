"""Owner-added training library: links and files indexed into the shared docs library.

Chunks live in rag_chunks under LIBRARY_WORKSPACE_ID with source_id "lib:user:<slug>",
so chat (HYBRID/NOTES) finds them like the built-in library. Called by the Node API (ADMIN only).
"""
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.models import RagChunk
from ..db.session import get_db
from ..errors import AppException, ErrorCode
from ..services.embedding import EmbeddingService
from ..services.pdf import PDFService
from ..services.websearch import fetch_url, html_to_text
from scripts.build_library import BATCH, chunks as split_chunks, clean

router = APIRouter(prefix="/library")
embedding_service = EmbeddingService()
PREFIX = "lib:user:"


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"


def _extract(name: str, data: bytes) -> tuple[str, str]:
    """(title hint, text) for a PDF, HTML, Markdown or text document."""
    lower = name.lower()
    if lower.endswith(".pdf"):
        doc = PDFService.extract_document(data)
        return "", "\n\n".join(p["text"] for p in doc["pages"])
    raw = data.decode("utf-8", errors="ignore")
    if lower.endswith((".html", ".htm")) or raw.lstrip()[:200].lower().startswith(("<!doctype html", "<html")):
        return html_to_text(raw)
    if lower.endswith((".md", ".markdown", ".txt")):
        return "", raw
    raise AppException(ErrorCode.PDF_UNSUPPORTED_TYPE, message="Use a .pdf, .html, .md or .txt file or a web link.")


@router.post("/add")
async def add_item(
    title: str = Form(""),
    url: str = Form(""),
    addedBy: str = Form(""),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    url = url.strip()
    if bool(file) == bool(url):
        raise AppException(ErrorCode.BAD_REQUEST, message="Send either a file or a url.")
    if url:
        if not url.startswith(("http://", "https://")):
            raise AppException(ErrorCode.BAD_REQUEST, message="The link must start with http:// or https://")
        try:
            data = await asyncio.to_thread(fetch_url, url)
        except Exception as e:
            raise AppException(ErrorCode.BAD_REQUEST, message="Could not fetch that link.") from e
        name = url.split("?")[0]
    else:
        data = await file.read(settings.MAX_PDF_BYTES + 1)
        if len(data) > settings.MAX_PDF_BYTES:
            raise AppException(ErrorCode.PDF_TOO_LARGE)
        name = file.filename or ""
    page_title, text = await asyncio.to_thread(_extract, name, data)
    parts = split_chunks(clean(text, name))
    if not parts:
        raise AppException(ErrorCode.PDF_NO_TEXT, message="No readable text found.")
    title = title.strip() or page_title or (file.filename if file else url)
    source_id = PREFIX + _slug(title)
    vectors = []
    for i in range(0, len(parts), BATCH):
        vectors += await asyncio.to_thread(embedding_service.embed_documents, parts[i:i + BATCH])
    meta = {"title": title, "url": url, "addedBy": addedBy, "addedAt": datetime.now(timezone.utc).isoformat()}
    await db.execute(delete(RagChunk).where(RagChunk.workspace_id == settings.LIBRARY_WORKSPACE_ID,
                                            RagChunk.source_id == source_id))
    db.add_all([RagChunk(workspace_id=settings.LIBRARY_WORKSPACE_ID, source_type="NOTES", source_id=source_id,
                         doc_id=source_id, chunk_index=i, content=t, embedding=v, metadata_=meta)
                for i, (t, v) in enumerate(zip(parts, vectors))])
    await db.commit()
    return {"sourceId": source_id, "title": title, "chunks": len(parts)}


@router.get("/items")
async def list_items(db: AsyncSession = Depends(get_db)):
    q = (select(RagChunk.source_id, func.count(), func.min(RagChunk.metadata_["title"].astext),
                func.min(RagChunk.metadata_["url"].astext), func.min(RagChunk.metadata_["addedAt"].astext))
         .where(RagChunk.workspace_id == settings.LIBRARY_WORKSPACE_ID, RagChunk.source_id.like(PREFIX + "%"))
         .group_by(RagChunk.source_id))
    rows = (await db.execute(q)).all()
    return [{"sourceId": s, "chunks": n, "title": t, "url": u, "addedAt": a} for s, n, t, u, a in rows]


@router.delete("/items/{source_id:path}")
async def delete_item(source_id: str, db: AsyncSession = Depends(get_db)):
    if not source_id.startswith(PREFIX):
        raise AppException(ErrorCode.NOT_FOUND)
    await db.execute(delete(RagChunk).where(RagChunk.workspace_id == settings.LIBRARY_WORKSPACE_ID,
                                            RagChunk.source_id == source_id))
    await db.commit()
    return {"deleted": source_id}
