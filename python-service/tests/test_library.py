"""Training library endpoints: embeddings and DB are mocked."""
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app

PARA = "Citewise answers only from your documents and cites the page it used. " * 5


@pytest.fixture
def db():
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: session
    yield session
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_add_markdown_file_indexes_chunks(client, db):
    with patch("app.routers.library.embedding_service") as emb:
        emb.embed_documents.side_effect = lambda texts: [[0.0] * 3 for _ in texts]
        r = client.post("/library/add", data={"title": "My Notes", "addedBy": "owner"},
                        files={"file": ("n.md", BytesIO(PARA.encode()), "text/markdown")})
    assert r.status_code == 200
    assert r.json() == {"sourceId": "lib:user:my-notes", "title": "My Notes", "chunks": 1}
    rows = db.add_all.call_args[0][0]
    assert rows[0].source_id == "lib:user:my-notes" and rows[0].metadata_["addedBy"] == "owner"
    db.commit.assert_awaited()


def test_add_link_uses_page_title(client, db):
    html = f"<html><head><title>Great Page</title></head><body><p>{PARA}</p></body></html>".encode()
    with patch("app.routers.library.fetch_url", return_value=html), \
            patch("app.routers.library.embedding_service") as emb:
        emb.embed_documents.side_effect = lambda texts: [[0.0] * 3 for _ in texts]
        r = client.post("/library/add", data={"url": "https://example.com/a"})
    assert r.status_code == 200
    assert r.json()["title"] == "Great Page"


def test_add_needs_file_or_url(client, db):
    assert client.post("/library/add", data={"title": "x"}).status_code == 400


def test_add_rejects_non_http_link(client, db):
    assert client.post("/library/add", data={"url": "file:///etc/passwd"}).status_code == 400


def test_add_rejects_unknown_file_type(client, db):
    r = client.post("/library/add", files={"file": ("a.exe", BytesIO(b"MZ"), "application/octet-stream")})
    assert r.status_code == 400


def test_delete_only_user_items(client, db):
    assert client.delete("/library/items/lib:postgres").status_code == 404
    assert client.delete("/library/items/lib:user:my-notes").status_code == 200
