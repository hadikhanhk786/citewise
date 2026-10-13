from fastapi import APIRouter, Depends, UploadFile, File, Form, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from uuid import UUID

from ..db.session import get_db
from ..db.models import RagChunk
from ..schemas.rag import IngestYoutubeRequest, IngestYoutubeResponse
from ..services.youtube import YouTubeService
from ..services.pdf import PDFService
from ..services.chunking import Chunker
from ..services.embedding import EmbeddingService
from ..errors import AppException, ErrorCode

import logging

logger = logging.getLogger("uvicorn")

router = APIRouter()

chunker = Chunker()
embedding_service = EmbeddingService()

@router.post("/ingest/youtube", response_model=IngestYoutubeResponse)
async def ingest_youtube(
    req: IngestYoutubeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    request_id = request.headers.get("X-Request-ID")
    # 1. Parse Video ID
    video_id = YouTubeService.extract_video_id(str(req.url))
    if not video_id:
        raise AppException(ErrorCode.YT_INVALID_URL)

    try:
        # 2. Fetch Transcript
        transcript = YouTubeService.get_transcript(video_id)
        
        # 3. Chunk
        chunks = chunker.chunk_transcript(transcript)
        
        # 4. Embed
        texts = [c['text'] for c in chunks]
        embeddings = embedding_service.embed_documents(texts)
        
        # 5. DB Transaction
        # Delete existing chunks for this source
        await db.execute(
            delete(RagChunk).where(
                RagChunk.workspace_id == req.workspaceId,
                RagChunk.source_type == 'YOUTUBE',
                RagChunk.source_id == video_id
            )
        )
        
        # Insert new chunks
        title = await YouTubeService.get_video_title(video_id)
        
        rag_chunks = []
        for i, chunk in enumerate(chunks):
            rag_chunks.append(RagChunk(
                workspace_id=req.workspaceId,
                source_type='YOUTUBE',
                source_id=video_id,
                doc_id=video_id, # For youtube, source_id == doc_id
                chunk_index=i,
                content=chunk['text'],
                metadata_={
                    "start": chunk['start'],
                    "end": chunk['end'],
                    "title": title
                },
                embedding=embeddings[i]
            ))
        
        db.add_all(rag_chunks)
        await db.commit()
        
        return IngestYoutubeResponse(
            videoId=video_id,
            title=title,
            chunksIndexed=len(rag_chunks)
        )

    except AppException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "transcript" in msg or "subtitle" in msg or "caption" in msg:
            code = ErrorCode.YT_TRANSCRIPT_UNAVAILABLE
        elif "not found" in msg or "404" in msg:
            code = ErrorCode.YT_VIDEO_NOT_FOUND
        elif "embed" in msg:
            code = ErrorCode.EMBEDDING_FAILED
        else:
            code = ErrorCode.INTERNAL_SERVER_ERROR
        logger.error(
            "YouTube ingest failed",
            extra={
                "event": "INGESTION_FAILED",
                "source_type": "YOUTUBE",
                "workspace_id": str(req.workspaceId),
                "url": str(req.url),
                "error_code": code,
                "request_id": request_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise AppException(code, details={"video_id": video_id}) from e


@router.post("/ingest/pdf")
async def ingest_pdf(
    request: Request,
    workspaceId: UUID = Form(...),
    sourceId: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Parse a PDF, chunk page-by-page, embed, and store in pgvector."""
    request_id = request.headers.get("X-Request-ID")
    try:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise AppException(ErrorCode.PDF_UNSUPPORTED_TYPE)

        content_bytes = await file.read()
        if not content_bytes:
            raise AppException(ErrorCode.PDF_EMPTY_FILE)

        try:
            pages = PDFService.extract_pages(content_bytes)
        except Exception as e:
            raise AppException(ErrorCode.PDF_PARSE_FAILED, details={"reason": str(e)}) from e

        if not pages or not any(p.get("text", "").strip() for p in pages):
            raise AppException(ErrorCode.PDF_EMPTY_FILE)

        chunks = chunker.chunk_pdf_pages(pages)
        if not chunks:
            raise AppException(ErrorCode.PDF_PARSE_FAILED)

        texts = [c["text"] for c in chunks]
        embeddings = embedding_service.embed_documents(texts)

        # Replace any existing chunks for this PDF source
        await db.execute(
            delete(RagChunk).where(
                RagChunk.workspace_id == workspaceId,
                RagChunk.source_type == "PDF",
                RagChunk.source_id == sourceId,
            )
        )

        rag_chunks = []
        for i, chunk in enumerate(chunks):
            rag_chunks.append(RagChunk(
                workspace_id=workspaceId,
                source_type="PDF",
                source_id=sourceId,
                doc_id=file.filename,
                chunk_index=i,
                content=chunk["text"],
                metadata_={
                    "title": file.filename,
                    "page": chunk["page"],
                },
                embedding=embeddings[i],
            ))

        db.add_all(rag_chunks)
        await db.commit()

        return {
            "filename": file.filename,
            "pages": len(pages),
            "chunksIndexed": len(rag_chunks),
        }

    except AppException:
        raise
    except Exception as e:
        code = ErrorCode.EMBEDDING_FAILED if "embed" in str(e).lower() else ErrorCode.INTERNAL_SERVER_ERROR
        logger.error(
            "PDF ingest failed",
            extra={
                "event": "INGESTION_FAILED",
                "source_type": "PDF",
                "workspace_id": str(workspaceId),
                "source_id": sourceId,
                "filename": file.filename if file else None,
                "error_code": code,
                "request_id": request_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise AppException(code, details={"filename": file.filename if file else None}) from e


@router.post("/ingest/notes/upload")
async def ingest_notes(
    workspaceId: UUID = Form(...),
    sourceId: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        content_bytes = await file.read()
        content = content_bytes.decode('utf-8').strip()

        if not content:
            raise AppException(ErrorCode.PDF_EMPTY_FILE, message="File is empty")

        # Chunking (Text split)
        text_chunks = chunker.split_text(content)

        if not text_chunks:
            raise AppException(ErrorCode.PDF_EMPTY_FILE, message="No text chunks extracted")
        
        # Embed
        embeddings = embedding_service.embed_documents(text_chunks)
        
        # Delete old
        await db.execute(
            delete(RagChunk).where(
                RagChunk.workspace_id == workspaceId,
                RagChunk.source_type == 'NOTES',
                RagChunk.source_id == sourceId,
                RagChunk.doc_id == file.filename
            )
        )
        
        rag_chunks = []
        for i, text in enumerate(text_chunks):
            rag_chunks.append(RagChunk(
                workspace_id=workspaceId,
                source_type='NOTES',
                source_id=sourceId,
                doc_id=file.filename,
                chunk_index=i,
                content=text,
                metadata_={"title": file.filename},
                embedding=embeddings[i]
            ))
            
        db.add_all(rag_chunks)
        await db.commit()
        
        return {"filename": file.filename, "chunksIndexed": len(rag_chunks)}
        
    except AppException:
        raise
    except Exception as e:
        logger.error(
            "Notes ingest failed",
            extra={
                "event": "INGESTION_FAILED",
                "source_type": "NOTES",
                "workspace_id": str(workspaceId),
                "source_id": sourceId,
                "filename": file.filename,
                "error": str(e),
            },
            exc_info=True,
        )
        raise AppException(ErrorCode.INTERNAL_SERVER_ERROR) from e
