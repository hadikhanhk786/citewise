from fastapi import APIRouter, Depends, Request
from ..errors import AppException, ErrorCode
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import logging
import time
import tiktoken

from ..db.session import get_db
from ..db.models import RagChunk, VideoSummary
from ..schemas.rag import (
    SummarizeYoutubeRequest,
    SummarizeYoutubeResponse,
    SummaryData,
    Snapshot,
)
from ..services.llm import LLMService
from ..services.snapshot import SnapshotService
from ..config import settings

logger = logging.getLogger("uvicorn")

router = APIRouter()
llm_service = LLMService()
snapshot_service = SnapshotService()
tokenizer = tiktoken.get_encoding("cl100k_base")


def _select_chunks_within_budget(chunks, max_tokens: int) -> list[dict]:
    """Combine transcript chunks up to the token budget.

    Strategy: walk chunks in order (they are stored by chunk_index) and
    accumulate until the budget is exhausted.  This preserves chronological
    flow which is important for a coherent summary.
    """
    selected = []
    token_count = 0
    for chunk in chunks:
        chunk_tokens = len(tokenizer.encode(chunk.content))
        if token_count + chunk_tokens > max_tokens and selected:
            break
        selected.append({
            "content": chunk.content,
            "metadata": chunk.metadata_ or {},
        })
        token_count += chunk_tokens
    return selected


@router.post("/youtube", response_model=SummarizeYoutubeResponse)
async def summarize_youtube(
    req: SummarizeYoutubeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID")
    try:
        # 1. Check cache
        cache_stmt = select(VideoSummary).where(
            VideoSummary.workspace_id == req.workspaceId,
            VideoSummary.video_id == req.videoId,
        )
        cache_result = await db.execute(cache_stmt)
        cached = cache_result.scalar_one_or_none()

        if cached:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.info("Returning cached YouTube summary", extra={"metrics": {
                "latency_ms": latency_ms,
                "video_id": req.videoId,
                "cached": True,
            }})
            raw_summary = {k: v for k, v in cached.summary.items() if not k.startswith("_")}
            summary_data = SummaryData(**raw_summary)
            title = cached.summary.get("_title")
            cached_snapshots = cached.summary.get("_snapshots")
            snapshots = [Snapshot(**s) for s in cached_snapshots] if cached_snapshots else None
            return SummarizeYoutubeResponse(
                videoId=req.videoId,
                title=title,
                summary=summary_data,
                snapshots=snapshots,
                cached=True,
            )

        # 2. Fetch transcript chunks from DB
        chunks_stmt = (
            select(RagChunk)
            .where(
                RagChunk.workspace_id == req.workspaceId,
                RagChunk.source_type == "YOUTUBE",
                RagChunk.source_id == req.videoId,
            )
            .order_by(RagChunk.chunk_index)
        )
        result = await db.execute(chunks_stmt)
        chunks = result.scalars().all()

        if not chunks:
            raise AppException(
                ErrorCode.NOT_FOUND,
                message=f"Video '{req.videoId}' has not been indexed in this workspace.",
            )

        # 3. Combine chunks within token budget
        selected = _select_chunks_within_budget(chunks, settings.MAX_SUMMARY_TOKENS)

        if not selected:
            raise AppException(
                ErrorCode.YT_TRANSCRIPT_UNAVAILABLE,
                message="No transcript content available for this video.",
            )

        # 4. Generate summary via LLM
        summary_data = await llm_service.generate_summary(selected)

        # Extract title and video duration from first chunk metadata
        title = (chunks[0].metadata_ or {}).get("title")
        last_end = (chunks[-1].metadata_ or {}).get("end") or 0.0

        # 5. Fetch video frame snapshots for important moments identified by LLM
        snapshots: list[Snapshot] = []
        moments = summary_data.snapshotMoments or []
        if moments:
            try:
                timestamps = [m.timestamp for m in moments]
                labels = [m.label for m in moments]
                raw_snaps = await snapshot_service.get_snapshots(
                    req.videoId, timestamps, labels, last_end
                )
                snapshots = [Snapshot(**s) for s in raw_snaps]
            except Exception as snap_err:
                logger.warning("Snapshot extraction failed, continuing without snapshots",
                               extra={"video_id": req.videoId, "error": str(snap_err)})

        # 6. Cache the result (store snapshots alongside summary)
        cache_payload = summary_data.model_dump()
        cache_payload["_title"] = title
        if snapshots:
            cache_payload["_snapshots"] = [s.model_dump() for s in snapshots]
        cache_entry = VideoSummary(
            workspace_id=req.workspaceId,
            video_id=req.videoId,
            summary=cache_payload,
        )
        db.add(cache_entry)
        await db.commit()

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("YouTube summary generated", extra={"metrics": {
            "latency_ms": latency_ms,
            "video_id": req.videoId,
            "chunks_total": len(chunks),
            "chunks_used": len(selected),
            "snapshots_count": len(snapshots),
            "cached": False,
            "ai_provider": llm_service.provider,
        }})

        return SummarizeYoutubeResponse(
            videoId=req.videoId,
            title=title,
            summary=summary_data,
            snapshots=snapshots or None,
            cached=False,
        )

    except AppException:
        raise
    except Exception as e:
        logger.error(
            "YouTube summary generation failed",
            extra={
                "event": "SUMMARY_FAILED",
                "workspace_id": str(req.workspaceId),
                "video_id": req.videoId,
                "error_code": ErrorCode.LLM_FAILED,
                "request_id": request_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise AppException(ErrorCode.LLM_FAILED) from e
