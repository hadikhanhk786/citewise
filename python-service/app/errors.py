"""Structured error handling for the Python AI service.

Mirrors server/src/lib/error-codes.ts — keep codes in sync.
"""
from __future__ import annotations

from typing import Any, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse

# ---- Error codes (keep in sync with Node) --------------------------------

class ErrorCode:

    PDF_UNSUPPORTED_TYPE = "PDF_UNSUPPORTED_TYPE"
    PDF_EMPTY_FILE = "PDF_EMPTY_FILE"
    PDF_PARSE_FAILED = "PDF_PARSE_FAILED"
    PDF_TOO_LARGE = "PDF_TOO_LARGE"
    PDF_ENCRYPTED = "PDF_ENCRYPTED"
    PDF_NO_TEXT = "PDF_NO_TEXT"
    PDF_TOO_MANY_PAGES = "PDF_TOO_MANY_PAGES"

    EMBEDDING_FAILED = "EMBEDDING_FAILED"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_FAILED = "LLM_FAILED"
    OLLAMA_UNAVAILABLE = "OLLAMA_UNAVAILABLE"
    OLLAMA_MODEL_MISSING = "OLLAMA_MODEL_MISSING"

    CHAT_NO_CONTEXT = "CHAT_NO_CONTEXT"
    CHAT_FAILED = "CHAT_FAILED"

    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    BAD_REQUEST = "BAD_REQUEST"
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR"


_STATUS_BY_CODE: dict[str, int] = {
    ErrorCode.PDF_UNSUPPORTED_TYPE: 400,
    ErrorCode.PDF_EMPTY_FILE: 400,
    ErrorCode.PDF_PARSE_FAILED: 422,
    ErrorCode.PDF_TOO_LARGE: 413,
    ErrorCode.PDF_ENCRYPTED: 422,
    ErrorCode.PDF_NO_TEXT: 422,
    ErrorCode.PDF_TOO_MANY_PAGES: 413,
    ErrorCode.EMBEDDING_FAILED: 502,
    ErrorCode.LLM_TIMEOUT: 504,
    ErrorCode.LLM_FAILED: 502,
    ErrorCode.OLLAMA_UNAVAILABLE: 503,
    ErrorCode.OLLAMA_MODEL_MISSING: 503,
    ErrorCode.CHAT_NO_CONTEXT: 200,
    ErrorCode.CHAT_FAILED: 500,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.BAD_REQUEST: 400,
    ErrorCode.INTERNAL_SERVER_ERROR: 500,
}

# Internal (dev) messages — user-friendly translation happens in Node.
_DEV_MESSAGE: dict[str, str] = {
    ErrorCode.PDF_UNSUPPORTED_TYPE: "File must be a .pdf",
    ErrorCode.PDF_EMPTY_FILE: "PDF is empty or has no extractable text",
    ErrorCode.PDF_PARSE_FAILED: "Failed to parse PDF",
    ErrorCode.PDF_ENCRYPTED: "PDF is password-protected",
    ErrorCode.PDF_NO_TEXT: "PDF has no extractable text (scanned/image-only?)",
    ErrorCode.PDF_TOO_MANY_PAGES: "PDF has too many pages",
    ErrorCode.OLLAMA_UNAVAILABLE: "Ollama is not reachable",
    ErrorCode.OLLAMA_MODEL_MISSING: "Ollama model is not installed",
    ErrorCode.EMBEDDING_FAILED: "Embedding pipeline failed",
    ErrorCode.LLM_TIMEOUT: "LLM call timed out",
    ErrorCode.LLM_FAILED: "LLM call failed",
    ErrorCode.CHAT_NO_CONTEXT: "No relevant context for question",
    ErrorCode.INTERNAL_SERVER_ERROR: "Internal server error",
}


class AppException(Exception):
    """Structured exception. Raise from routers to return standard error envelope."""

    def __init__(
        self,
        code: str,
        message: Optional[str] = None,
        hint: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self.code = code
        self.message = message or _DEV_MESSAGE.get(code, code)
        self.hint = hint
        self.details = details or {}
        self.status_code = status_code or _STATUS_BY_CODE.get(code, 500)
        super().__init__(self.message)


def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "hint": exc.hint,
                "details": exc.details,
            }
        },
    )


def build_error_response(
    code: str,
    message: str,
    *,
    hint: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    status_code: Optional[int] = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code or _STATUS_BY_CODE.get(code, status.HTTP_500_INTERNAL_SERVER_ERROR),
        content={
            "error": {
                "code": code,
                "message": message,
                "hint": hint,
                "details": details or {},
            }
        },
    )
