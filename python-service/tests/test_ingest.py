"""
Tests for the ingestion endpoints — Notes.
Uses dependency overrides to avoid real DB and embedding calls.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from io import BytesIO

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


# ── Notes Ingestion ─────────────────────────────────────────────────────

class TestIngestNotes:
    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    def test_empty_file_returns_400(self, MockChunker, MockEmbed, client):
        response = client.post(
            "/ingest/notes/upload",
            data={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "sourceId": "src-1",
            },
            files={"file": ("empty.md", BytesIO(b""), "text/markdown")},
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "PDF_EMPTY_FILE"

    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    def test_whitespace_only_file_returns_400(self, MockChunker, MockEmbed, client):
        response = client.post(
            "/ingest/notes/upload",
            data={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "sourceId": "src-1",
            },
            files={"file": ("spaces.md", BytesIO(b"   \n\n  "), "text/markdown")},
        )

        assert response.status_code == 400

    def test_missing_file_returns_422(self, client):
        response = client.post(
            "/ingest/notes/upload",
            data={
                "workspaceId": "00000000-0000-4000-a000-000000000001",
                "sourceId": "src-1",
            },
        )

        assert response.status_code == 422

    def test_missing_workspace_id_returns_422(self, client):
        response = client.post(
            "/ingest/notes/upload",
            data={"sourceId": "src-1"},
            files={"file": ("test.md", BytesIO(b"content"), "text/markdown")},
        )

        assert response.status_code == 422
