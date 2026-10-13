# RAG Architecture Notes

## Overview

Retrieval Augmented Generation (RAG) is an AI framework that enhances Large Language Model (LLM) responses by grounding them in external knowledge sources. Instead of relying solely on training data, RAG retrieves relevant documents at query time and provides them as context.

## Key Components

### 1. Document Ingestion Pipeline
- Documents are split into chunks (typically 500 tokens with 50-token overlap)
- Each chunk is converted to a vector embedding using models like Gemini embedding-001 or OpenAI text-embedding-3-small
- Embeddings are stored in a vector database (pgvector in PostgreSQL)

### 2. Retrieval
- User queries are also embedded using the same model
- The system performs similarity search using L2 distance
- Top-K most similar chunks are retrieved (default K=6)
- In HYBRID mode, results are split 50/50 between YouTube and Notes sources

### 3. Generation
- Retrieved chunks are formatted as context
- A system prompt instructs the LLM to only use provided context
- The LLM generates a response with citations pointing back to source material
- Citations include source type, title, timestamps (for YouTube), and text snippets

## Best Practices

- Set similarity threshold to filter out irrelevant chunks (L2 distance <= 1.2)
- Use strictSources=true when accuracy is critical — returns "no information found" rather than hallucinating
- Monitor chunk retrieval counts and latency via structured logging
- Keep chunk sizes balanced — too small loses context, too large dilutes relevance

## Common Failure Modes

1. **No transcript available** — YouTube videos without captions will fail ingestion
2. **Empty notes** — Files with no readable text are rejected at upload
3. **API key missing** — Embedding service returns 502 without valid credentials
4. **Postgres down** — All operations fail; health endpoint reports degraded
