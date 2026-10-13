# My Learning Copilot — RAG Service

Python FastAPI microservice providing RAG (Retrieval-Augmented Generation) capabilities for the My Learning Copilot application.

## Features

- **YouTube Ingestion**: Fetches transcripts, chunks with timestamp preservation, embeds, and stores in pgvector
- **Notes Ingestion**: Accepts markdown/text uploads, chunks by headings, embeds, and stores
- **RAG Chat**: Retrieves relevant chunks via vector similarity, generates grounded answers with citations
- **Multi-Provider**: Supports OpenAI and Google Gemini for embeddings and chat

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| POST | `/ingest/youtube` | Ingest YouTube video transcript |
| POST | `/ingest/notes/upload` | Upload and ingest notes files |
| POST | `/rag/chat` | RAG-powered chat with citations |

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Copy and configure env
cp .env.example .env

# Run locally
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Docker

```bash
docker build -t rag-service .
docker run -p 8000:8000 --env-file .env rag-service
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `LLM_PROVIDER` | `openai` or `gemini` | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | Required if provider=openai |
| `OPENAI_CHAT_MODEL` | Chat model name | `gpt-3.5-turbo` |
| `OPENAI_EMBED_MODEL` | Embedding model name | `text-embedding-3-small` |
| `GEMINI_API_KEY` | Google Gemini API key | Required if provider=gemini |
| `GEMINI_CHAT_MODEL` | Chat model name | `gemini-pro` |
| `GEMINI_EMBED_MODEL` | Embedding model name | `models/embedding-001` |

## API Examples

### Ingest YouTube
```bash
curl -X POST http://localhost:8000/ingest/youtube \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "uuid-here", "url": "https://youtu.be/dQw4w9WgXcQ"}'
```
**Response**:
```json
{
  "videoId": "dQw4w9WgXcQ",
  "chunksIndexed": 42
}
```

### RAG Chat
```bash
curl -X POST http://localhost:8000/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "uuid-here",
    "mode": "HYBRID",
    "strictSources": false,
    "message": "What are the key topics discussed?",
    "topK": 6
  }'
```
**Response**:
```json
{
  "answer": "The key topics discussed include AI agents and their reasoning capabilities.",
  "citations": [
    {
      "sourceType": "YOUTUBE",
      "title": "Video dQw4w9WgXcQ",
      "sourceId": "dQw4w9WgXcQ",
      "docId": null,
      "timestampStart": "153",
      "timestampEnd": "165",
      "heading": null,
      "snippet": "We should talk about what AI agents actually do inside loops..."
    }
  ]
}
```
