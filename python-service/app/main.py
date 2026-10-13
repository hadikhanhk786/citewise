from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import health, ingest, rag, summarize
from contextlib import asynccontextmanager
from sqlalchemy import text
from .db.session import engine, Base
import logging
import os
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import Request, status

from .logger import setup_logging, request_id_ctx_var
from .errors import AppException, app_exception_handler, ErrorCode, build_error_response

# Configure structured JSON logging
setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if not exist (Simulating migration for MVP)
    async with engine.begin() as conn:
        # Ensure pgvector extension exists
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown

app = FastAPI(lifespan=lifespan)

# CORS — read from env var ALLOWED_ORIGINS (comma-separated).
# Defaults to localhost dev origins; set "*" only if explicitly configured.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(rag.router, prefix="/rag")
app.include_router(summarize.router, prefix="/summarize")

@app.middleware("http")
async def extract_request_id(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID")
    if req_id:
        request_id_ctx_var.set(req_id)
    response = await call_next(request)
    if req_id:
        response.headers["X-Request-ID"] = req_id
    return response

# Exception Handlers
@app.exception_handler(AppException)
async def _app_exception_handler(request: Request, exc: AppException):
    logger.warning(
        "AppException: %s",
        exc.code,
        extra={"error_code": exc.code, "route": request.url.path},
    )
    return app_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return build_error_response(
        ErrorCode.VALIDATION_ERROR,
        "Validation error",
        hint="Please check your input and try again.",
        details={"issues": exc.errors()},
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Do not leak raw HTTPException details to clients — map to canonical codes.
    code = ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.BAD_REQUEST
    return build_error_response(code, str(exc.detail), status_code=exc.status_code)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s: %s",
        request.url.path,
        exc,
        exc_info=True,
        extra={"route": request.url.path, "error_code": ErrorCode.INTERNAL_SERVER_ERROR},
    )
    # Never leak raw stack traces in response body.
    return build_error_response(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Internal server error",
    )

@app.get("/")
async def root():
    return {"message": "My Learning Copilot AI Service"}
