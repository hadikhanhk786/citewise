from fastapi import APIRouter, Depends, Request
from ..errors import AppException, ErrorCode
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.session import get_db
from ..db.models import RagChunk
from ..schemas.rag import ChatRequest, ChatResponse, Citation
from ..services.embedding import EmbeddingService
from ..services.llm import LLMService

import logging
import math
import asyncio
import time
from ..config import settings

logger = logging.getLogger("uvicorn")

router = APIRouter()
embedding_service = EmbeddingService()
llm_service = LLMService()

@router.post("/chat", response_model=ChatResponse)
async def chat_rag(req: ChatRequest, request: Request, db: AsyncSession = Depends(get_db)):
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID")
    try:
        # 1. Embed query
        query_vector = embedding_service.embed_query(req.message)
        
        # Base query setup
        base_stmt = select(RagChunk).where(RagChunk.workspace_id == req.workspaceId)
        
        # Additional filters
        if req.filters:
            if req.filters.sourceIds:
                base_stmt = base_stmt.where(RagChunk.source_id.in_(req.filters.sourceIds))
            if req.filters.videoId:
                base_stmt = base_stmt.where(RagChunk.source_id == req.filters.videoId)
        
        # Apply score threshold (L2 distance)
        base_stmt = base_stmt.where(RagChunk.embedding.l2_distance(query_vector) <= settings.SIMILARITY_THRESHOLD)
        base_stmt = base_stmt.order_by(RagChunk.embedding.l2_distance(query_vector))
        
        top_k = req.topK or settings.DEFAULT_TOP_K
        
        # Execute queries based on Mode
        if req.mode == 'HYBRID':
            youtube_stmt = base_stmt.where(RagChunk.source_type == 'YOUTUBE').limit(math.ceil(top_k / 2))
            pdf_stmt = base_stmt.where(RagChunk.source_type == 'PDF').limit(math.floor(top_k / 2))

            yt_res, pdf_res = await asyncio.gather(
                db.execute(youtube_stmt),
                db.execute(pdf_stmt)
            )
            chunks = yt_res.scalars().all() + pdf_res.scalars().all()
        else:
            if req.mode == 'YOUTUBE':
                stmt = base_stmt.where(RagChunk.source_type == 'YOUTUBE')
            elif req.mode == 'PDF':
                stmt = base_stmt.where(RagChunk.source_type == 'PDF')
            else:
                stmt = base_stmt

            stmt = stmt.limit(top_k)
            result = await db.execute(stmt)
            chunks = result.scalars().all()
            
        if not chunks and req.strictSources:
            return ChatResponse(
                answer="No relevant information found in the provided sources.",
                citations=[]
            )
        
        # 3. LLM Generation
        answer, citations = await llm_service.generate_response(req.message, chunks, req.strictSources)
        
        latency_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "RAG query generated successfully",
            extra={"metrics": {
                "latency_ms": latency_ms,
                "chunks_retrieved_count": len(chunks),
                "top_k": top_k,
                "ai_provider": llm_service.provider
            }}
        )
        
        return ChatResponse(
            answer=answer,
            citations=citations
        )

    except AppException:
        raise
    except asyncio.TimeoutError as e:
        logger.error("RAG chat LLM timeout", extra={
            "event": "CHAT_RAG_FAILED",
            "workspace_id": str(req.workspaceId),
            "mode": req.mode,
            "error_code": ErrorCode.LLM_TIMEOUT,
            "request_id": request_id,
        })
        raise AppException(ErrorCode.LLM_TIMEOUT) from e
    except Exception as e:
        msg = str(e).lower()
        code = ErrorCode.LLM_FAILED if "llm" in msg or "gemini" in msg or "openai" in msg else ErrorCode.CHAT_FAILED
        logger.error(
            "RAG chat failed",
            extra={
                "event": "CHAT_RAG_FAILED",
                "workspace_id": str(req.workspaceId),
                "mode": req.mode,
                "error_code": code,
                "request_id": request_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise AppException(code) from e
