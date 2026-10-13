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
    # Ollama's default context window (2-4k tokens) silently truncates long
    # prompts; grounded answers send several chunks of evidence.
    OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", 8192))
    LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", 180))

    # Grounded (cited) PDF answers
    GROUNDED_TOP_K = int(os.getenv("GROUNDED_TOP_K", 6))
    GROUNDED_TEMPERATURE = float(os.getenv("GROUNDED_TEMPERATURE", 0.1))
    SUMMARY_MAX_CHUNKS = int(os.getenv("SUMMARY_MAX_CHUNKS", 10))
    MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", 2000))
    # Defence in depth: the Node API enforces its own (usually lower) limit.
    MAX_PDF_BYTES = int(os.getenv("MAX_PDF_BYTES", 50 * 1024 * 1024))

settings = Settings()
