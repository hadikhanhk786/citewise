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


def make_mock_chunk(source_type="PDF", source_id="doc1", doc_id="doc1",
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
                "mode": "NOTES",
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
    def test_notes_mode_is_accepted(self, mock_embed, mock_llm, client):
        """The server sends HYBRID, PDF or NOTES; NOTES used to be rejected with 422."""
        mock_embed.embed_query.return_value = [0.1] * 3072
        mock_llm.generate_response = AsyncMock(return_value=("ok", []))
        from app.db.session import get_db

        async def mock_db():
            db = MagicMock()
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            db.execute = AsyncMock(return_value=result)
            yield db

        app.dependency_overrides[get_db] = mock_db
        try:
            response = client.post("/rag/chat", json={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "mode": "NOTES",
                "message": "question",
            })
            assert response.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ── Prompt-cache friendly ordering ──────────────────────────────────────

class TestChunkOrder:
    @patch("app.routers.rag.llm_service")
    @patch("app.routers.rag.embedding_service")
    def test_chunks_reach_the_llm_in_document_order(self, mock_embed, mock_llm, client):
        """Relevance order changes per question; document order keeps the prompt prefix stable."""
        mock_embed.embed_query.return_value = [0.1] * 3072
        mock_llm.generate_response = AsyncMock(return_value=("answer", []))
        by_relevance = [
            make_mock_chunk(source_type="PDF", source_id="b", chunk_index=0),
            make_mock_chunk(source_type="PDF", source_id="a", chunk_index=7),
            make_mock_chunk(source_type="PDF", source_id="a", chunk_index=2),
        ]
        from app.db.session import get_db

        async def mock_db():
            db = MagicMock()
            result = MagicMock()
            result.scalars.return_value.all.return_value = by_relevance
            db.execute = AsyncMock(return_value=result)
            yield db

        app.dependency_overrides[get_db] = mock_db
        try:
            response = client.post("/rag/chat", json={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "mode": "PDF",
                "message": "question",
            })
            assert response.status_code == 200
            sent = mock_llm.generate_response.call_args.args[1]
            assert [(c.source_id, c.chunk_index) for c in sent] == [("a", 2), ("a", 7), ("b", 0)]
        finally:
            app.dependency_overrides.clear()
