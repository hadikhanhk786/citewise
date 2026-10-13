from __future__ import annotations
from typing import List, Dict, Any
import io

from fastapi import HTTPException
from pypdf import PdfReader
from pypdf.errors import PdfReadError


class PDFService:
    """Parse PDF bytes into per-page text records.

    Each record preserves the page number so downstream chunking can attach
    page metadata, which is then surfaced as a citation in the RAG response.
    """

    @staticmethod
    def extract_pages(file_bytes: bytes) -> List[Dict[str, Any]]:
        if not file_bytes:
            raise HTTPException(status_code=400, detail="PDF file is empty")
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
        except PdfReadError as e:
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {e}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")

        pages: List[Dict[str, Any]] = []
        for idx, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            text = text.strip()
            if not text:
                continue
            pages.append({"page": idx + 1, "text": text})

        if not pages:
            raise HTTPException(
                status_code=400,
                detail="No extractable text found in PDF (it may be a scanned/image-only PDF)",
            )
        return pages
