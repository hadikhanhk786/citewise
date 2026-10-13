from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from ..db.session import get_db
from ..schemas.rag import HealthResponse
from ..services.embedding import EmbeddingService
import os

router = APIRouter()
embedding_service = EmbeddingService()

@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "down"
        
    embeddings_status = "ok"
    try:
        # Just check if the object is initialized properly with keys
        if not embedding_service._embeddings:
             embeddings_status = "down"
    except Exception:
        embeddings_status = "down"

    return HealthResponse(
        status="ok" if db_status == "ok" and embeddings_status == "ok" else "degraded",
        provider=os.getenv("LLM_PROVIDER", "unknown"),
        db=db_status,
        embeddings=embeddings_status
    )
