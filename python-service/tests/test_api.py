from fastapi.testclient import TestClient
from app.main import app
import pytest

client = TestClient(app)

def test_health_check_endpoint():
    # Mocking Database or EmbeddingService liveness would require dependency overrides in a real suite.
    # For now, we simulate hitting the endpoint. It might return 500 or degraded without live Postgres/Gemini but that's fine.
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "db" in data
    assert "embeddings" in data
    assert "provider" in data

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "My Learning Copilot AI Service"}
