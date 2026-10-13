"""
Tests for the health check endpoint — replaces/extends test_api.py.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import get_db


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        """Health endpoint should always return 200, even if degraded."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "db" in data
        assert "embeddings" in data
        assert "provider" in data

    def test_health_status_is_ok_or_degraded(self, client):
        response = client.get("/health")
        data = response.json()
        assert data["status"] in ("ok", "degraded")

    def test_health_with_db_down(self, client):
        """When DB is unavailable, health should report degraded."""
        async def mock_db_down():
            db = MagicMock()
            db.execute = AsyncMock(side_effect=Exception("connection refused"))
            yield db

        app.dependency_overrides[get_db] = mock_db_down

        try:
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["db"] == "down"
            assert data["status"] == "degraded"
        finally:
            app.dependency_overrides.clear()


class TestRootEndpoint:
    def test_root_returns_service_message(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "My Learning Copilot AI Service"}
