"""Translate AI-provider exceptions into canonical AppExceptions.

Ollama runs locally, so "it isn't running" and "the model isn't pulled" are
the common failures; both get specific codes so the UI can tell the user
exactly what to do.
"""
from __future__ import annotations
import asyncio

import httpx

from ..errors import AppException, ErrorCode


def _is_connection_error(exc: BaseException) -> bool:
    if isinstance(exc, (ConnectionError, httpx.ConnectError, httpx.ConnectTimeout)):
        return True
    msg = str(exc).lower()
    return (
        "connection refused" in msg
        or "failed to connect" in msg
        or "all connection attempts failed" in msg
        or "cannot connect" in msg
    )


def _is_model_missing(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return "model" in msg and ("not found" in msg or "try pulling" in msg)


def to_app_exception(exc: BaseException, *, default_code: str, model: str | None = None) -> AppException:
    if isinstance(exc, AppException):
        return exc
    if isinstance(exc, asyncio.TimeoutError):
        return AppException(ErrorCode.LLM_TIMEOUT)
    if _is_model_missing(exc):
        return AppException(
            ErrorCode.OLLAMA_MODEL_MISSING,
            hint=f"Run `ollama pull {model}` and try again." if model else None,
            details={"model": model} if model else None,
        )
    if _is_connection_error(exc):
        return AppException(ErrorCode.OLLAMA_UNAVAILABLE, hint="Start Ollama (`ollama serve`) and try again.")
    return AppException(default_code)
