"""Evidence-only answers and summaries over a project's PDF documents.

Citations returned here have been validated against the chunks that were
actually retrieved (see services/grounded.py); the document id and page number
always come from the stored chunk, never from the model.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import asyncio
import logging
import time

from ..config import settings
from ..db.models import RagChunk
from ..db.session import get_db
from ..errors import AppException, ErrorCode
from ..schemas.rag import GroundedAnswerRequest, GroundedAnswerResponse, GroundedSummaryRequest
from ..services import grounded
from ..services.embedding import EmbeddingService
from ..services.llm import LLMService

logger = logging.getLogger("uvicorn")

router = APIRouter()
embedding_service = EmbeddingService()
llm_service = LLMService()


def _response(result: grounded.GroundedResult, retrieved: int) -> GroundedAnswerResponse:
    payload = result.to_dict()
    return GroundedAnswerResponse(
        status=payload["status"],
        answer=payload["answer"],
        citations=payload["citations"],
        retrievedCount=retrieved,
    )


@router.post("/answer", response_model=GroundedAnswerResponse)
async def grounded_answer(req: GroundedAnswerRequest, request: Request, db: AsyncSession = Depends(get_db)):
    start = time.time()
    request_id = request.headers.get("X-Request-ID")
    document_ids = [str(d) for d in req.documentIds]
    top_k = req.topK or settings.GROUNDED_TOP_K

    try:
        query_vector = await asyncio.to_thread(embedding_service.embed_query, req.question)
        distance = RagChunk.embedding.l2_distance(query_vector)
        stmt = (
            select(RagChunk)
            .where(
                RagChunk.workspace_id == req.workspaceId,
                RagChunk.source_type == "PDF",
                RagChunk.source_id.in_(document_ids),
                distance <= settings.SIMILARITY_THRESHOLD,
            )
            .order_by(distance)
            .limit(top_k)
        )
        chunks = (await db.execute(stmt)).scalars().all()
        evidence = grounded.build_evidence(chunks)

        if not evidence:
            result = grounded.insufficient("no_relevant_chunks")
        else:
            system, user = grounded.build_answer_prompt(req.question, evidence)
            raw = await llm_service.generate_grounded_json(system, user)
            result = grounded.validate_model_output(raw, evidence, hint=req.question)

        logger.info("Grounded answer", extra={
            "event": "GROUNDED_ANSWER",
            "request_id": request_id,
            "metrics": {
                "latency_ms": int((time.time() - start) * 1000),
                "retrieved": len(evidence),
                "status": result.status,
                "citations": len(result.citations),
                "rejected_refs": len(result.rejectedRefs),
                "reason": result.reason,
            },
        })
        return _response(result, len(evidence))
    except AppException:
        raise
    except Exception as e:
        logger.error("Grounded answer failed", extra={
            "event": "GROUNDED_ANSWER_FAILED", "request_id": request_id, "error": str(e),
        }, exc_info=True)
        raise AppException(ErrorCode.CHAT_FAILED) from e


@router.post("/summarize-document", response_model=GroundedAnswerResponse)
async def grounded_summary(req: GroundedSummaryRequest, request: Request, db: AsyncSession = Depends(get_db)):
    request_id = request.headers.get("X-Request-ID")
    try:
        stmt = (
            select(RagChunk)
            .where(
                RagChunk.workspace_id == req.workspaceId,
                RagChunk.source_type == "PDF",
                RagChunk.source_id == str(req.documentId),
            )
            .order_by(RagChunk.chunk_index)
        )
        chunks = (await db.execute(stmt)).scalars().all()
        if not chunks:
            raise AppException(ErrorCode.NOT_FOUND, message="Document has not been indexed.")

        # Spread the evidence across the whole document, in reading order.
        evidence = grounded.build_evidence(grounded.sample_evenly(list(chunks), settings.SUMMARY_MAX_CHUNKS))
        system, user = grounded.build_summary_prompt(evidence)
        raw = await llm_service.generate_grounded_json(system, user)
        result = grounded.validate_model_output(raw, evidence, hint="summary overview key points")

        logger.info("Grounded summary", extra={
            "event": "GROUNDED_SUMMARY",
            "request_id": request_id,
            "metrics": {"status": result.status, "citations": len(result.citations), "reason": result.reason},
        })
        return _response(result, len(evidence))
    except AppException:
        raise
    except Exception as e:
        logger.error("Grounded summary failed", extra={
            "event": "GROUNDED_SUMMARY_FAILED", "request_id": request_id, "error": str(e),
        }, exc_info=True)
        raise AppException(ErrorCode.LLM_FAILED) from e
