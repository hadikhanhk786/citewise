from sqlalchemy import Column, String, Integer, Text, DateTime, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from .session import Base
from ..config import settings
import uuid

class RagChunk(Base):
    __tablename__ = "rag_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=False)
    source_type = Column(String, nullable=False)  # 'PDF' or 'NOTES'
    source_id = Column(String, nullable=False)
    doc_id = Column(String, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=False, default={})
    embedding = Column(Vector(settings.EMBEDDING_DIM), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_rag_chunks_workspace_source', workspace_id, source_type, source_id),
        Index('idx_rag_chunks_doc_id', doc_id),
        # ivfflat index creation usually done manually or via alembic as it needs rows.
        # validating pgvector extension existence is done via migration usually.
    )


class VideoSummary(Base):
    __tablename__ = "video_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=False)
    video_id = Column(String, nullable=False)
    summary = Column(JSONB, nullable=False)  # {overview, keyPoints, chapters}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('workspace_id', 'video_id', name='uq_video_summary_workspace_video'),
        Index('idx_video_summaries_lookup', workspace_id, video_id),
    )
