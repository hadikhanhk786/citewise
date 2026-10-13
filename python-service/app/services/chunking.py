from __future__ import annotations
import tiktoken
from typing import List, Dict, Any, Optional

from ..config import settings

class Chunker:
    def __init__(self, chunk_size=None, chunk_overlap=None):
        self.chunk_size = chunk_size if chunk_size is not None else settings.CHUNK_SIZE
        self.chunk_overlap = chunk_overlap if chunk_overlap is not None else settings.CHUNK_OVERLAP
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def split_text(self, text: str) -> List[str]:
        tokens = self.tokenizer.encode(text)
        chunks = []
        step = max(1, self.chunk_size - self.chunk_overlap)
        for i in range(0, len(tokens), step):
            chunk_tokens = tokens[i:i + self.chunk_size]
            chunks.append(self.tokenizer.decode(chunk_tokens))
        return chunks

    def chunk_pdf_pages(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Token-aware chunking that preserves page boundaries.

        Input: list of {page: int, text: str}
        Output: list of {text: str, page: int} where page is the page where
                the chunk *starts*. A long page is split into multiple chunks;
                short pages are kept whole (no cross-page packing) so citations
                stay accurate.
        """
        chunks: List[Dict[str, Any]] = []
        for page in pages:
            page_num = page["page"]
            text = page["text"]
            if not text:
                continue
            tokens = self.tokenizer.encode(text)
            if len(tokens) <= self.chunk_size:
                chunks.append({"text": text, "page": page_num})
                continue
            # Split a long page into overlapping windows
            step = max(1, self.chunk_size - self.chunk_overlap)
            for i in range(0, len(tokens), step):
                window = tokens[i : i + self.chunk_size]
                if not window:
                    break
                chunks.append({
                    "text": self.tokenizer.decode(window),
                    "page": page_num,
                })
        return chunks

    def chunk_transcript(self, transcript: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Chunk transcript preserving timestamp boundaries.
        Input: list of {text, start, duration}
        Output: list of {text, start, end}
        """
        chunks = []
        current_chunk = []
        current_tokens = 0
        chunk_start = 0.0
        
        for segment in transcript:
            text = segment['text']
            start = segment['start']
            duration = segment.get('duration', 0)
            end = start + duration
            
            seg_tokens = len(self.tokenizer.encode(text))
            
            if not current_chunk:
                chunk_start = start
            
            if current_tokens + seg_tokens > self.chunk_size and current_chunk:
                # Flush current chunk
                full_text = " ".join([s['text'] for s in current_chunk])
                chunk_end = current_chunk[-1]['start'] + current_chunk[-1].get('duration', 0)
                chunks.append({
                    "text": full_text,
                    "start": chunk_start,
                    "end": chunk_end
                })
                # Start new chunk with overlaps not implemented for simplicity in transcript
                # (timestamp overlap is tricky), just create new
                current_chunk = []
                current_tokens = 0
                chunk_start = start
            
            current_chunk.append(segment)
            current_tokens += seg_tokens
            
        if current_chunk:
            full_text = " ".join([s['text'] for s in current_chunk])
            chunk_end = current_chunk[-1]['start'] + current_chunk[-1].get('duration', 0)
            chunks.append({
                "text": full_text,
                "start": chunk_start,
                "end": chunk_end
            })
            
        return chunks
