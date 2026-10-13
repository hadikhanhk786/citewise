"""
/rag/answer and /rag/summarize-document with a fake DB and deterministic
model responses. Also covers Ollama being unavailable.
"""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app

WS = "00000000-0000-4000-a000-000000000001"
DOC_A = "00000000-0000-4000-a000-0000000000aa"
DOC_B = "00000000-0000-4000-a000-0000000000bb"


def chunk(id, source_id, page, content, title="Report.pdf", index=0):
    c = MagicMock()
    c.id = id
    c.source_id = source_id
    c.source_type = "PDF"
    c.content = content
    c.chunk_index = index
    c.metadata_ = {"page": page, "title": title}
    return c


class FakeSession:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        result = MagicMock()
        result.scalars.return_value.all.return_value = self.rows
        return result


@pytest.fixture
def db_rows():
    rows = []
    session = FakeSession(rows)

    async def _override():
        yield session

    app.dependency_overrides[get_db] = _override
    yield rows
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    return TestClient(app)


def ask(client, question="What was revenue growth?", docs=(DOC_A,)):
    return client.post("/rag/answer", json={"workspaceId": WS, "documentIds": list(docs), "question": question})


@patch("app.routers.grounded.llm_service")
@patch("app.routers.grounded.embedding_service")
class TestAnswer:
    def test_cites_correct_document_and_page(self, mock_embed, mock_llm, client, db_rows):
        mock_embed.embed_query.return_value = [0.0] * 768
        db_rows.extend([
            chunk("chunk-1", DOC_A, 4, "Revenue grew 12% year over year."),
            chunk("chunk-2", DOC_B, 11, "Headcount rose to 240 people.", title="HR.pdf"),
        ])
        mock_llm.generate_grounded_json = AsyncMock(return_value=json.dumps({
            "answer": "Revenue grew 12% [C1] while headcount reached 240 [C2].",
            "citations": [{"ref": "C1", "quote": "Revenue grew 12%"}, {"ref": "C2", "quote": "Headcount rose to 240 people"}],
            "insufficient_evidence": False,
        }))

        r = ask(client, docs=(DOC_A, DOC_B))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ANSWERED"
        assert body["answer"] == "Revenue grew 12% [1] while headcount reached 240 [2]."
        assert [(c["documentId"], c["page"], c["chunkId"], c["title"]) for c in body["citations"]] == [
            (DOC_A, 4, "chunk-1", "Report.pdf"),
            (DOC_B, 11, "chunk-2", "HR.pdf"),
        ]
        assert body["retrievedCount"] == 2

    def test_invalid_citation_rejected(self, mock_embed, mock_llm, client, db_rows):
        mock_embed.embed_query.return_value = [0.0] * 768
        db_rows.append(chunk("chunk-1", DOC_A, 4, "Revenue grew 12% year over year."))
        mock_llm.generate_grounded_json = AsyncMock(return_value=json.dumps({
            "answer": "Revenue grew 12% [C1] and profit doubled [C5].",
            "citations": [{"ref": "C5", "quote": "profit doubled"}],
        }))
        body = ask(client).json()
        assert body["status"] == "ANSWERED"
        assert [c["chunkId"] for c in body["citations"]] == ["chunk-1"]
        assert "[C5]" not in body["answer"] and "[2]" not in body["answer"]

    def test_no_relevant_chunks_skips_model(self, mock_embed, mock_llm, client, db_rows):
        mock_embed.embed_query.return_value = [0.0] * 768
        mock_llm.generate_grounded_json = AsyncMock()
        body = ask(client, question="What is the CEO's favourite colour?").json()
        assert body["status"] == "INSUFFICIENT_EVIDENCE"
        assert body["citations"] == []
        assert "couldn't establish" in body["answer"]
        mock_llm.generate_grounded_json.assert_not_called()

    def test_model_says_insufficient(self, mock_embed, mock_llm, client, db_rows):
        mock_embed.embed_query.return_value = [0.0] * 768
        db_rows.append(chunk("chunk-1", DOC_A, 1, "Unrelated text about office plants."))
        mock_llm.generate_grounded_json = AsyncMock(return_value='{"answer": "", "citations": [], "insufficient_evidence": true}')
        body = ask(client).json()
        assert body["status"] == "INSUFFICIENT_EVIDENCE"
        assert body["citations"] == []

    def test_validation(self, mock_embed, mock_llm, client, db_rows):
        assert client.post("/rag/answer", json={"workspaceId": WS, "documentIds": [], "question": "q"}).status_code == 422
        assert client.post("/rag/answer", json={"workspaceId": WS, "documentIds": [DOC_A], "question": ""}).status_code == 422
        assert client.post("/rag/answer", json={"workspaceId": WS, "documentIds": ["../etc"], "question": "q"}).status_code == 422


class TestOllamaUnavailable:
    """Exercise the real error mapping in EmbeddingService / LLMService."""

    def test_embedding_connection_refused(self, client, db_rows):
        from app.routers import grounded as router
        with patch.object(router.embedding_service, "_embeddings") as emb:
            emb.embed_query.side_effect = httpx.ConnectError("All connection attempts failed")
            r = ask(client)
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "OLLAMA_UNAVAILABLE"

    def _patch_llm(self, router, ainvoke):
        bound = MagicMock()
        bound.ainvoke = ainvoke
        llm = MagicMock()
        llm.bind.return_value = bound
        llm.ainvoke = ainvoke
        return patch.object(router.llm_service, "llm", llm)

    def test_chat_model_connection_refused(self, client, db_rows):
        from app.routers import grounded as router
        db_rows.append(chunk("chunk-1", DOC_A, 1, "Revenue grew."))
        with patch.object(router.embedding_service, "embed_query", return_value=[0.0] * 768), \
             self._patch_llm(router, AsyncMock(side_effect=ConnectionError("Failed to connect to Ollama"))):
            r = ask(client)
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "OLLAMA_UNAVAILABLE"

    def test_model_not_pulled(self, client, db_rows):
        from app.routers import grounded as router
        db_rows.append(chunk("chunk-1", DOC_A, 1, "Revenue grew."))
        with patch.object(router.embedding_service, "embed_query", return_value=[0.0] * 768), \
             self._patch_llm(router, AsyncMock(side_effect=Exception("model \"llama3.2\" not found, try pulling it first"))):
            r = ask(client)
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "OLLAMA_MODEL_MISSING"

    def test_timeout(self, client, db_rows, monkeypatch):
        from app.routers import grounded as router
        monkeypatch.setattr("app.services.llm.settings.LLM_TIMEOUT_SECONDS", 0.05)
        db_rows.append(chunk("chunk-1", DOC_A, 1, "Revenue grew."))

        async def slow(*_a, **_k):
            await asyncio.sleep(1)

        with patch.object(router.embedding_service, "embed_query", return_value=[0.0] * 768), \
             self._patch_llm(router, slow):
            r = ask(client)
        assert r.status_code == 504
        assert r.json()["error"]["code"] == "LLM_TIMEOUT"


@patch("app.routers.grounded.llm_service")
class TestSummary:
    def test_summary_cites_pages_across_document(self, mock_llm, client, db_rows):
        db_rows.extend([chunk(f"c{i}", DOC_A, i + 1, f"Finding number {i} is important.", index=i) for i in range(3)])
        mock_llm.generate_grounded_json = AsyncMock(return_value=json.dumps({
            "answer": "Overview [C1].\n- Third finding [C3]",
            "citations": [{"ref": "C1", "quote": "Finding number 0 is important"}],
        }))
        body = client.post("/rag/summarize-document", json={"workspaceId": WS, "documentId": DOC_A}).json()
        assert body["status"] == "ANSWERED"
        assert [(c["ordinal"], c["page"]) for c in body["citations"]] == [(1, 1), (2, 3)]

    def test_unindexed_document_404(self, mock_llm, client, db_rows):
        r = client.post("/rag/summarize-document", json={"workspaceId": WS, "documentId": DOC_A})
        assert r.status_code == 404
