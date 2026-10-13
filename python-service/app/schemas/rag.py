from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from typing import List, Optional, Any, Dict, Literal
from uuid import UUID
from datetime import datetime

# --- Ingest ---
class IngestYoutubeRequest(BaseModel):
    workspaceId: UUID
    url: HttpUrl

class IngestYoutubeResponse(BaseModel):
    videoId: str
    title: Optional[str] = None
    chunksIndexed: int

# --- Chat ---
class ChatFilters(BaseModel):
    sourceIds: Optional[List[str]] = None
    videoId: Optional[str] = None
    pdfSourceId: Optional[str] = None

class ChatRequest(BaseModel):
    workspaceId: UUID
    mode: Literal['YOUTUBE', 'PDF', 'HYBRID']
    strictSources: bool = False
    message: str = Field(..., min_length=1)
    filters: Optional[ChatFilters] = None
    topK: Optional[int] = Field(6, ge=1, le=20)

class Citation(BaseModel):
    sourceType: str
    title: str
    sourceId: str
    docId: str
    timestampStart: Optional[str] = None
    timestampEnd: Optional[str] = None
    page: Optional[int] = None
    heading: Optional[str] = None
    snippet: str

class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]

# --- Summary ---
class SummarizeYoutubeRequest(BaseModel):
    workspaceId: UUID
    videoId: str = Field(..., min_length=1)

class SummaryChapter(BaseModel):
    title: str
    timestampStart: str
    timestampEnd: str
    summary: str

class SnapshotMoment(BaseModel):
    timestamp: float
    label: str

class Snapshot(BaseModel):
    timestamp: float
    timestampDisplay: str
    label: str
    spriteUrl: str
    frameWidth: int
    frameHeight: int
    x: int
    y: int

class SummaryData(BaseModel):
    overview: str
    keyPoints: List[str]
    chapters: Optional[List[SummaryChapter]] = None
    snapshotMoments: Optional[List[SnapshotMoment]] = None

class SummarizeYoutubeResponse(BaseModel):
    videoId: str
    title: Optional[str] = None
    summary: SummaryData
    snapshots: Optional[List[Snapshot]] = None
    cached: bool = False

# --- Health ---
class HealthResponse(BaseModel):
    status: str
    provider: str
    db: str
    embeddings: str
