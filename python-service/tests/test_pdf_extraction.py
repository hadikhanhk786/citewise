"""
PDF extraction + chunking: page numbers must survive end to end, and bad
files must fail with specific, actionable error codes.
"""
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.errors import AppException
from app.main import app
from app.services.chunking import Chunker
from app.services.pdf import PDFService
from pdf_factory import make_encrypted_pdf, make_pdf


# ── Extraction ──────────────────────────────────────────────────────────

class TestExtractDocument:
    def test_page_numbers_match_physical_pages(self):
        pdf = make_pdf(["Alpha is on page one", "Beta is on page two", "Gamma is on page three"])
        doc = PDFService.extract_document(pdf)
        assert doc["page_count"] == 3
        assert [(p["page"], p["text"]) for p in doc["pages"]] == [
            (1, "Alpha is on page one"),
            (2, "Beta is on page two"),
            (3, "Gamma is on page three"),
        ]

    def test_blank_pages_do_not_shift_numbering(self):
        doc = PDFService.extract_document(make_pdf(["First", "", "", "Fourth page text"]))
        assert doc["page_count"] == 4
        assert [p["page"] for p in doc["pages"]] == [1, 4]

    def test_empty_bytes(self):
        with pytest.raises(AppException) as e:
            PDFService.extract_document(b"")
        assert e.value.code == "PDF_EMPTY_FILE"

    def test_not_a_pdf(self):
        with pytest.raises(AppException) as e:
            PDFService.extract_document(b"PK\x03\x04 this is a zip file")
        assert e.value.code == "PDF_UNSUPPORTED_TYPE"

    def test_corrupt_pdf(self):
        with pytest.raises(AppException) as e:
            PDFService.extract_document(b"%PDF-1.4\n" + b"\x00garbage" * 50)
        assert e.value.code in ("PDF_PARSE_FAILED", "PDF_EMPTY_FILE")

    def test_encrypted_pdf(self):
        with pytest.raises(AppException) as e:
            PDFService.extract_document(make_encrypted_pdf(["Top secret"]))
        assert e.value.code == "PDF_ENCRYPTED"

    def test_image_only_pdf_has_no_text(self):
        with pytest.raises(AppException) as e:
            PDFService.extract_document(make_pdf(["", ""]))
        assert e.value.code == "PDF_NO_TEXT"
        assert e.value.details["pageCount"] == 2

    def test_scanned_pages_are_ocrd_in_page_order(self, monkeypatch):
        calls = []
        def fake_ocr(file_bytes, page_numbers):
            calls.append(page_numbers)
            return {1: "Scanned  first page\n\n\n\nmore", 3: "   "}
        monkeypatch.setattr("app.services.pdf._ocr_pages", fake_ocr)
        doc = PDFService.extract_document(make_pdf(["", "Typed page two", ""]))
        assert calls == [[1, 3]]  # only pages without a text layer
        assert [(p["page"], p["text"]) for p in doc["pages"]] == [
            (1, "Scanned  first page\n\nmore"),
            (2, "Typed page two"),
        ]

    def test_ocr_finding_nothing_still_reports_no_text(self, monkeypatch):
        monkeypatch.setattr("app.services.pdf._ocr_pages", lambda b, pages: {})
        with pytest.raises(AppException) as e:
            PDFService.extract_document(make_pdf(["", ""]))
        assert e.value.code == "PDF_NO_TEXT"

    def test_too_many_pages(self, monkeypatch):
        monkeypatch.setattr("app.services.pdf.settings.MAX_PDF_PAGES", 2)
        with pytest.raises(AppException) as e:
            PDFService.extract_document(make_pdf(["a", "b", "c"]))
        assert e.value.code == "PDF_TOO_MANY_PAGES"


# ── Chunking keeps pages ───────────────────────────────────────────────

class TestChunkingPreservesPages:
    def test_every_chunk_text_comes_from_its_page(self):
        long_page = "\n".join(f"Sentence {i} about revenue growth in the northern region." for i in range(60))
        pdf = make_pdf(["Short intro page.", long_page, "Closing remarks on page three."])
        pages = PDFService.extract_document(pdf)["pages"]
        chunks = Chunker(chunk_size=60, chunk_overlap=10).chunk_pdf_pages(pages)

        page_text = {p["page"]: p["text"] for p in pages}
        assert {c["page"] for c in chunks} == {1, 2, 3}
        assert sum(1 for c in chunks if c["page"] == 2) > 1  # long page was split
        for c in chunks:
            # Token-decoded text may differ in whitespace only.
            assert " ".join(c["text"].split()) in " ".join(page_text[c["page"]].split())

    def test_long_page_chunks_overlap(self):
        text = " ".join(f"word{i}" for i in range(400))
        chunks = Chunker(chunk_size=50, chunk_overlap=10).chunk_pdf_pages([{"page": 7, "text": text}])
        assert all(c["page"] == 7 for c in chunks)
        first, second = chunks[0]["text"].split(), chunks[1]["text"].split()
        assert set(first[-3:]) & set(second[:15])  # tail of chunk 1 reappears in chunk 2


# ── API ────────────────────────────────────────────────────────────────

class FakeSession:
    def __init__(self):
        self.added = []
        self.executed = []
        self.committed = False

    async def execute(self, stmt):
        self.executed.append(stmt)
        return MagicMock()

    def add_all(self, rows):
        self.added.extend(rows)

    async def commit(self):
        self.committed = True


@pytest.fixture
def fake_db():
    session = FakeSession()

    async def _override():
        yield session

    app.dependency_overrides[get_db] = _override
    yield session
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    return TestClient(app)


class TestExtractEndpoint:
    def test_reports_page_counts(self, client):
        pdf = make_pdf(["One", "", "Three"])
        r = client.post("/ingest/pdf/extract", files={"file": ("report.pdf", BytesIO(pdf), "application/pdf")})
        assert r.status_code == 200
        assert r.json() == {"pageCount": 3, "pagesWithText": 2, "characters": len("One") + len("Three")}

    def test_rejects_non_pdf_extension(self, client):
        r = client.post("/ingest/pdf/extract", files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")})
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "PDF_UNSUPPORTED_TYPE"

    def test_rejects_disguised_file(self, client):
        r = client.post("/ingest/pdf/extract", files={"file": ("fake.pdf", BytesIO(b"<html>nope</html>"), "application/pdf")})
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "PDF_UNSUPPORTED_TYPE"

    def test_encrypted_is_422(self, client):
        r = client.post("/ingest/pdf/extract", files={"file": ("locked.pdf", BytesIO(make_encrypted_pdf(["x"])), "application/pdf")})
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "PDF_ENCRYPTED"


class TestIngestPdfStoresPages:
    @patch("app.routers.ingest.embedding_service")
    def test_chunks_are_stored_with_page_metadata(self, mock_embed, client, fake_db):
        mock_embed.embed_documents.side_effect = lambda texts: [[0.0] * 768 for _ in texts]
        pdf = make_pdf(["Intro text", "", "Findings on page three"])
        r = client.post(
            "/ingest/pdf",
            data={"workspaceId": "00000000-0000-4000-a000-000000000001", "sourceId": "doc-123"},
            files={"file": ("study.pdf", BytesIO(pdf), "application/pdf")},
        )
        assert r.status_code == 200
        assert r.json() == {"filename": "study.pdf", "pages": 3, "pagesWithText": 2, "chunksIndexed": 2}
        assert fake_db.committed
        stored = [(c.source_id, c.source_type, c.metadata_["page"], c.content) for c in fake_db.added]
        assert stored == [
            ("doc-123", "PDF", 1, "Intro text"),
            ("doc-123", "PDF", 3, "Findings on page three"),
        ]

    @patch("app.routers.ingest.embedding_service")
    def test_ollama_down_during_embedding_is_503(self, mock_embed, client, fake_db):
        from app.errors import ErrorCode
        mock_embed.embed_documents.side_effect = AppException(ErrorCode.OLLAMA_UNAVAILABLE)
        r = client.post(
            "/ingest/pdf",
            data={"workspaceId": "00000000-0000-4000-a000-000000000001", "sourceId": "doc-1"},
            files={"file": ("a.pdf", BytesIO(make_pdf(["text"])), "application/pdf")},
        )
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "OLLAMA_UNAVAILABLE"
        assert fake_db.added == [] and not fake_db.committed
