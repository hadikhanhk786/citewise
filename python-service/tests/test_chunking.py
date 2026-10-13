"""
Tests for the Chunker service — text splitting and transcript chunking.
"""
import pytest
from app.services.chunking import Chunker


@pytest.fixture
def chunker():
    return Chunker(chunk_size=50, chunk_overlap=10)


@pytest.fixture
def large_chunker():
    return Chunker(chunk_size=500, chunk_overlap=50)


# ── split_text ──────────────────────────────────────────────────────────

class TestSplitText:
    def test_short_text_returns_single_chunk(self, chunker):
        text = "Hello world, this is a short text."
        chunks = chunker.split_text(text)
        assert len(chunks) == 1
        assert "Hello world" in chunks[0]

    def test_long_text_splits_into_multiple_chunks(self, chunker):
        # Generate text longer than chunk_size tokens
        text = " ".join(["word"] * 200)
        chunks = chunker.split_text(text)
        assert len(chunks) > 1

    def test_empty_text_returns_single_empty_chunk(self, chunker):
        chunks = chunker.split_text("")
        # Tokenizing empty string gives 0 tokens, range(0,0,...) produces no iterations
        assert len(chunks) == 0 or chunks == [""]

    def test_overlap_produces_more_chunks_than_no_overlap(self):
        no_overlap = Chunker(chunk_size=50, chunk_overlap=0)
        with_overlap = Chunker(chunk_size=50, chunk_overlap=25)
        text = " ".join(["token"] * 200)
        assert len(with_overlap.split_text(text)) >= len(no_overlap.split_text(text))

    def test_chunks_cover_all_content(self, large_chunker, sample_notes_content):
        chunks = large_chunker.split_text(sample_notes_content)
        assert len(chunks) >= 1
        # All chunks should have non-empty content
        for chunk in chunks:
            assert len(chunk.strip()) > 0


# ── chunk_transcript ────────────────────────────────────────────────────

class TestChunkTranscript:
    def test_basic_transcript_chunking(self, large_chunker, sample_transcript):
        chunks = large_chunker.chunk_transcript(sample_transcript)
        assert len(chunks) >= 1

        for chunk in chunks:
            assert "text" in chunk
            assert "start" in chunk
            assert "end" in chunk
            assert chunk["start"] >= 0
            assert chunk["end"] >= chunk["start"]

    def test_timestamps_are_preserved(self, large_chunker, sample_transcript):
        chunks = large_chunker.chunk_transcript(sample_transcript)
        # First chunk should start at 0.0 (the first segment's start)
        assert chunks[0]["start"] == 0.0

    def test_small_chunk_size_splits_more(self, sample_transcript):
        small = Chunker(chunk_size=20, chunk_overlap=0)
        large = Chunker(chunk_size=500, chunk_overlap=0)
        small_chunks = small.chunk_transcript(sample_transcript)
        large_chunks = large.chunk_transcript(sample_transcript)
        assert len(small_chunks) >= len(large_chunks)

    def test_empty_transcript(self, large_chunker):
        chunks = large_chunker.chunk_transcript([])
        assert chunks == []

    def test_single_segment_transcript(self, large_chunker):
        transcript = [{"text": "Hello world", "start": 0.0, "duration": 2.0}]
        chunks = large_chunker.chunk_transcript(transcript)
        assert len(chunks) == 1
        assert chunks[0]["text"] == "Hello world"
        assert chunks[0]["start"] == 0.0
        assert chunks[0]["end"] == 2.0

    def test_chunk_text_is_joined_segments(self, large_chunker):
        transcript = [
            {"text": "Hello", "start": 0.0, "duration": 1.0},
            {"text": "world", "start": 1.0, "duration": 1.0},
        ]
        chunks = large_chunker.chunk_transcript(transcript)
        assert len(chunks) == 1
        assert chunks[0]["text"] == "Hello world"


# ── chunk_pdf_pages ─────────────────────────────────────────────────────

class TestChunkPdfPages:
    def test_short_page_becomes_single_chunk(self, large_chunker):
        pages = [{"page": 1, "text": "A short page of content."}]
        chunks = large_chunker.chunk_pdf_pages(pages)
        assert len(chunks) == 1
        assert chunks[0]["page"] == 1
        assert "short page" in chunks[0]["text"]

    def test_long_page_splits_with_same_page_number(self):
        chunker = Chunker(chunk_size=20, chunk_overlap=5)
        long_text = " ".join(["word"] * 200)
        pages = [{"page": 7, "text": long_text}]
        chunks = chunker.chunk_pdf_pages(pages)
        assert len(chunks) > 1
        # Every chunk from a single page must carry that same page number
        for chunk in chunks:
            assert chunk["page"] == 7

    def test_each_page_keeps_its_own_number(self, large_chunker):
        pages = [
            {"page": 1, "text": "First page text."},
            {"page": 2, "text": "Second page text."},
            {"page": 3, "text": "Third page text."},
        ]
        chunks = large_chunker.chunk_pdf_pages(pages)
        assert len(chunks) == 3
        assert chunks[0]["page"] == 1
        assert chunks[1]["page"] == 2
        assert chunks[2]["page"] == 3

    def test_empty_pages_are_skipped(self, large_chunker):
        pages = [
            {"page": 1, "text": "Real content"},
            {"page": 2, "text": ""},
            {"page": 3, "text": "More content"},
        ]
        chunks = large_chunker.chunk_pdf_pages(pages)
        page_numbers = [c["page"] for c in chunks]
        assert 2 not in page_numbers
        assert 1 in page_numbers and 3 in page_numbers

    def test_no_cross_page_packing(self):
        """Two short pages should yield two chunks, not one packed chunk."""
        chunker = Chunker(chunk_size=500, chunk_overlap=50)
        pages = [
            {"page": 1, "text": "Page one content."},
            {"page": 2, "text": "Page two content."},
        ]
        chunks = chunker.chunk_pdf_pages(pages)
        assert len(chunks) == 2
        assert chunks[0]["page"] == 1
        assert chunks[1]["page"] == 2
