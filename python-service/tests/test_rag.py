"""
Tests for the RAG chat endpoint — mode filtering, strictSources, and citation structure.
Uses mocks to avoid real DB, embedding, and LLM calls.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.rag import Citation


@pytest.fixture
def client():
    return TestClient(app)


def make_mock_chunk(source_type="YOUTUBE", source_id="vid1", doc_id="vid1",
                    content="test content", chunk_index=0, title="Test Source",
                    start=0.0, end=5.0):
    """Create a mock RagChunk object."""
    chunk = MagicMock()
    chunk.source_type = source_type
    chunk.source_id = source_id
    chunk.doc_id = doc_id
    chunk.content = content
    chunk.chunk_index = chunk_index
    chunk.metadata_ = {"title": title, "start": start, "end": end}
    chunk.embedding = [0.1] * 3072
    return chunk


# ── Request Validation ──────────────────────────────────────────────────

class TestChatValidation:
    def test_missing_message_returns_422(self, client):
        response = client.post("/rag/chat", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "mode": "HYBRID",
        })
        assert response.status_code == 422

    def test_empty_message_returns_422(self, client):
        response = client.post("/rag/chat", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "mode": "HYBRID",
            "message": "",
        })
        assert response.status_code == 422

    def test_invalid_mode_returns_422(self, client):
        response = client.post("/rag/chat", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "mode": "INVALID",
            "message": "test",
        })
        assert response.status_code == 422

    def test_topk_out_of_range_returns_422(self, client):
        response = client.post("/rag/chat", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "mode": "HYBRID",
            "message": "test",
            "topK": 100,
        })
        assert response.status_code == 422

    def test_missing_workspace_id_returns_422(self, client):
        response = client.post("/rag/chat", json={
            "mode": "HYBRID",
            "message": "test",
        })
        assert response.status_code == 422


# ── Citation Structure ──────────────────────────────────────────────────

class TestCitationFormatting:
    def test_youtube_citation_has_required_fields(self):
        citation = Citation(
            sourceType="YOUTUBE",
            title="RAG Tutorial",
            sourceId="abc123",
            docId="abc123",
            timestampStart="0",
            timestampEnd="5",
            snippet="welcome to this tutorial...",
        )
        assert citation.sourceType == "YOUTUBE"
        assert citation.timestampStart == "0"
        assert citation.timestampEnd == "5"
        assert citation.snippet is not None

    def test_pdf_citation_has_page_field(self):
        citation = Citation(
            sourceType="PDF",
            title="paper.pdf",
            sourceId="src-1",
            docId="paper.pdf",
            page=7,
            snippet="RAG architecture overview...",
        )
        assert citation.sourceType == "PDF"
        assert citation.page == 7
        assert citation.timestampStart is None
        assert citation.timestampEnd is None

    def test_pdf_citation_without_page(self):
        citation = Citation(
            sourceType="PDF",
            title="paper.pdf",
            sourceId="src-1",
            docId="paper.pdf",
            snippet="Document ingestion pipeline...",
        )
        assert citation.page is None


# ── strictSources Behavior ──────────────────────────────────────────────

class TestStrictSources:
    @patch("app.routers.rag.llm_service")
    @patch("app.routers.rag.embedding_service")
    def test_strict_sources_no_chunks_lets_the_model_answer(self, mock_embed, mock_llm, client):
        """No matching chunks: the model still answers (greetings, "who are you?",
        or its own "not enough information"), with no citations."""
        mock_embed.embed_query.return_value = [0.1] * 3072
        mock_llm.generate_response = AsyncMock(return_value=("Hi! I'm Citewise.", []))

        # Override the DB dependency to return no chunks
        from app.db.session import get_db

        async def mock_db():
            db = MagicMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            db.execute = AsyncMock(return_value=mock_result)
            yield db

        app.dependency_overrides[get_db] = mock_db

        try:
            response = client.post("/rag/chat", json={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "mode": "YOUTUBE",
                "strictSources": True,
                "message": "What is the capital of France?",
            })

            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "Hi! I'm Citewise."
            assert data["citations"] == []
            args = mock_llm.generate_response.call_args.args
            assert args[1] == [] and args[2] is True  # no chunks, strict flag passed on
        finally:
            app.dependency_overrides.clear()


# ── Mode Filtering ──────────────────────────────────────────────────────

class TestModeFiltering:
    @patch("app.routers.rag.llm_service")
    @patch("app.routers.rag.embedding_service")
    def test_youtube_mode_queries_youtube_chunks(self, mock_embed, mock_llm, client):
        mock_embed.embed_query.return_value = [0.1] * 3072

        yt_chunk = make_mock_chunk(source_type="YOUTUBE", content="youtube content")

        from app.db.session import get_db

        async def mock_db():
            db = MagicMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [yt_chunk]
            db.execute = AsyncMock(return_value=mock_result)
            yield db

        app.dependency_overrides[get_db] = mock_db

        mock_llm.generate_response = AsyncMock(return_value=(
            "Answer based on YouTube",
            [Citation(
                sourceType="YOUTUBE", title="Test", sourceId="vid1",
                docId="vid1", snippet="youtube content...",
                timestampStart="0", timestampEnd="5"
            )]
        ))

        try:
            response = client.post("/rag/chat", json={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "mode": "YOUTUBE",
                "message": "What is discussed?",
            })

            assert response.status_code == 200
            data = response.json()
            assert len(data["citations"]) >= 1
            for citation in data["citations"]:
                assert citation["sourceType"] == "YOUTUBE"
        finally:
            app.dependency_overrides.clear()
