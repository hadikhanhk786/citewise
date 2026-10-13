from __future__ import annotations
from typing import List, Dict, Any
import io
import re

from pypdf import PdfReader

from ..config import settings
from ..errors import AppException, ErrorCode


def _normalise_page_text(text: str) -> str:
    # NUL bytes break Postgres TEXT columns; collapse runs of blank lines.
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class PDFService:
    """Parse PDF bytes into per-page text records.

    Each record preserves the 1-based page number of the *physical* page in the
    file, so downstream chunking can attach page metadata that matches what a
    PDF viewer shows, which is then surfaced as a citation in the RAG response.
    """

    @staticmethod
    def extract_document(file_bytes: bytes) -> Dict[str, Any]:
        """Return {"page_count": int, "pages": [{"page": int, "text": str}]}.

        Pages without extractable text are omitted from "pages" but still
        counted in "page_count". Raises AppException with a specific code for
        empty, non-PDF, corrupt, encrypted, oversized, or image-only files.
        """
        if not file_bytes:
            raise AppException(ErrorCode.PDF_EMPTY_FILE)
        # The spec allows the header anywhere in the first 1024 bytes.
        if b"%PDF-" not in file_bytes[:1024]:
            raise AppException(ErrorCode.PDF_UNSUPPORTED_TYPE, message="File is not a PDF")

        try:
            reader = PdfReader(io.BytesIO(file_bytes), strict=False)
        except Exception as e:
            raise AppException(ErrorCode.PDF_PARSE_FAILED, details={"reason": str(e)[:200]}) from e

        if reader.is_encrypted:
            # Some PDFs are "encrypted" with an empty user password and open fine.
            try:
                if not reader.decrypt(""):
                    raise AppException(ErrorCode.PDF_ENCRYPTED)
            except AppException:
                raise
            except Exception as e:
                raise AppException(ErrorCode.PDF_ENCRYPTED) from e

        try:
            page_count = len(reader.pages)
        except Exception as e:
            raise AppException(ErrorCode.PDF_PARSE_FAILED, details={"reason": str(e)[:200]}) from e

        if page_count == 0:
            raise AppException(ErrorCode.PDF_EMPTY_FILE)
        if page_count > settings.MAX_PDF_PAGES:
            raise AppException(
                ErrorCode.PDF_TOO_MANY_PAGES,
                details={"pageCount": page_count, "maxPages": settings.MAX_PDF_PAGES},
            )

        pages: List[Dict[str, Any]] = []
        for idx in range(page_count):
            try:
                text = reader.pages[idx].extract_text() or ""
            except Exception:
                text = ""
            text = _normalise_page_text(text)
            if text:
                pages.append({"page": idx + 1, "text": text})

        if not pages:
            raise AppException(ErrorCode.PDF_NO_TEXT, details={"pageCount": page_count})

        return {"page_count": page_count, "pages": pages}

    @staticmethod
    def extract_pages(file_bytes: bytes) -> List[Dict[str, Any]]:
        """Backwards-compatible helper returning only the text pages."""
        return PDFService.extract_document(file_bytes)["pages"]
