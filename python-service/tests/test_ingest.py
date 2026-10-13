"""
Tests for the ingestion endpoints — YouTube and Notes.
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


# ── YouTube Ingestion ───────────────────────────────────────────────────

class TestIngestYoutube:
    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    @patch("app.routers.ingest.YouTubeService")
    def test_invalid_youtube_url_returns_400(self, MockYT, MockChunker, MockEmbed, client):
        MockYT.extract_video_id.return_value = None

        response = client.post("/ingest/youtube", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "url": "https://vimeo.com/123"
        })

        assert response.status_code == 400
        assert "Invalid YouTube URL" in response.json()["detail"]

    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    @patch("app.routers.ingest.YouTubeService")
    def test_missing_url_returns_422(self, MockYT, MockChunker, MockEmbed, client):
        response = client.post("/ingest/youtube", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001"
        })

        assert response.status_code == 422

    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    @patch("app.routers.ingest.YouTubeService")
    def test_missing_workspace_id_returns_422(self, MockYT, MockChunker, MockEmbed, client):
        response = client.post("/ingest/youtube", json={
            "url": "https://www.youtube.com/watch?v=abc123"
        })

        assert response.status_code == 422

    @patch("app.routers.ingest.embedding_service")
    @patch("app.routers.ingest.chunker")
    @patch("app.routers.ingest.YouTubeService")
    def test_disabled_transcript_returns_400(self, MockYT, MockChunker, MockEmbed, client):
        from fastapi import HTTPException
        MockYT.extract_video_id.return_value = "abc123"
        MockYT.get_transcript.side_effect = HTTPException(
            status_code=400, detail="Transcripts are disabled for this video"
        )

        response = client.post("/ingest/youtube", json={
            "workspaceId": "00000000-0000-4000-a000-000000000001",
            "url": "https://www.youtube.com/watch?v=abc123"
        })

        assert response.status_code == 400
        assert "disabled" in response.json()["detail"].lower()


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
        assert "empty" in response.json()["detail"].lower()

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
