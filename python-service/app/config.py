import os

class Settings:
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 50))
    DEFAULT_TOP_K = int(os.getenv("DEFAULT_TOP_K", 6))
    SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.75))
    MAX_SUMMARY_TOKENS = int(os.getenv("MAX_SUMMARY_TOKENS", 12000))
    # Dimension must match the embedding model in use:
    #   3072 → Gemini gemini-embedding-001 / text-embedding-3-large
    #   1536 → OpenAI text-embedding-3-small
    #    768 → Ollama nomic-embed-text
    EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", 3072))
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

settings = Settings()
