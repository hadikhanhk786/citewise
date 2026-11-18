from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from typing import List, Optional, Any, Dict, Literal
from uuid import UUID
from datetime import datetime

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

# --- Health ---
class HealthResponse(BaseModel):
    status: str
    provider: str
    db: str
    embeddings: str

# --- Grounded PDF answers (project chat) ---
class ExtractPdfResponse(BaseModel):
    pageCount: int
    pagesWithText: int
    characters: int

class GroundedAnswerRequest(BaseModel):
    workspaceId: UUID
    documentIds: List[UUID] = Field(..., min_length=1, max_length=200)
    question: str = Field(..., min_length=1, max_length=4000)
    topK: Optional[int] = Field(None, ge=1, le=20)

class GroundedSummaryRequest(BaseModel):
    workspaceId: UUID
    documentId: UUID

class GroundedCitation(BaseModel):
    ordinal: int
    chunkId: str
    documentId: str
    title: str
    page: int
    excerpt: str
    quoteVerified: bool

class GroundedAnswerResponse(BaseModel):
    status: Literal['ANSWERED', 'INSUFFICIENT_EVIDENCE']
    answer: str
    citations: List[GroundedCitation]
    retrievedCount: int
