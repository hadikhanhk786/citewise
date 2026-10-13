from __future__ import annotations
import os
from langchain_openai import OpenAIEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.embeddings import Embeddings

class EmbeddingService:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "openai").lower()
        self.api_key = os.getenv(f"{self.provider.upper()}_API_KEY")
        self.model = os.getenv(f"{self.provider.upper()}_EMBED_MODEL")
        
        if not self.api_key:
             # Fallback or error, for now letting langchain handle valid keys
             pass
        
        if self.provider == "openai":
            self._embeddings = OpenAIEmbeddings(
                model=self.model or "text-embedding-3-small",
                api_key=self.api_key
            )
        elif self.provider == "gemini":
            self._embeddings = GoogleGenerativeAIEmbeddings(
                model=self.model or "models/embedding-001",
                google_api_key=self.api_key
            )
        elif self.provider == "ollama":
            from langchain_ollama import OllamaEmbeddings
            from ..config import settings
            self._embeddings = OllamaEmbeddings(
                model=self.model or "nomic-embed-text",
                base_url=settings.OLLAMA_BASE_URL
            )
        else:
            raise ValueError(f"Unsupported LLM_PROVIDER: {self.provider}")

    def embed_query(self, text: str) -> list[float]:
        try:
            return self._embeddings.embed_query(text)
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail=f"Embedding provider error: {str(e)}")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            return self._embeddings.embed_documents(texts)
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail=f"Embedding provider error: {str(e)}")
