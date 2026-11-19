# Citewise

**An AI reading assistant for your PDFs and notes. It answers only from your sources and cites the exact page each answer comes from.**

Upload a PDF or your notes, then ask questions in plain language. Citewise uses retrieval-augmented generation (RAG) to find the relevant passages and generate an answer. It then **checks every citation against the retrieved text** before showing it to you. If the evidence isn't there, it says so instead of guessing.

---

## Why Citewise?

Most "chat with your PDF" tools let the language model write its own citations, which makes it easy to cite a page that doesn't say what the model claims. Citewise treats the model's output as untrusted:

- **Evidence-only answers.** The model only sees labelled evidence chunks (`[C1]…[Cn]`) and must answer from them.
- **Verified citations.** A citation is kept only if it points to a chunk that was actually retrieved. The document title and page number come from the database, never from the model.
- **Quote checking.** Quoted passages are matched against the real chunk text, and unverifiable quotes are flagged.
- **Honest "I don't know".** When the evidence is too weak, the answer comes back as `INSUFFICIENT_EVIDENCE` instead of a hallucination.

---

## Features

| Area | What it does |
| --- | --- |
| 📄 **PDF reader** | Upload PDFs and extract text page by page. Rejects encrypted, corrupt, empty, image-only, or non-PDF files with clear messages (checked by magic bytes, not just the file extension). |
| 📝 **Notes ingestion** | Upload Markdown/text notes, chunked by heading. |
| 💬 **Hybrid RAG chat** | Chat sessions with citations across all your sources, with modes and a `strictSources` option. |
| ✅ **Grounded answers** | `/rag/answer` and `/rag/summarize-document` return verified, renumbered `[1]`, `[2]` citations with page and excerpt. |
| 🧠 **Multiple LLM providers** | OpenAI, Google Gemini, or fully local **Ollama**, for both chat and embeddings. |
| 👥 **Workspaces & RBAC** | JWT auth, workspaces, member roles, and audit logs. |
| 📊 **Insights dashboard** | Usage analytics and charts. |
| 🛡️ **Production-style error handling** | One error envelope shared by all services, friendly messages with hints, request-ID correlation, and a persisted `error_logs` table. |

---

## Architecture

```
┌──────────────────────┐      ┌───────────────────────────┐      ┌──────────────────────────────┐
│  React 19 + Vite UI  │ ───▶ │  Node.js / Express 5 API  │ ───▶ │  Python FastAPI RAG service  │
│  (TypeScript)        │      │  Auth · RBAC · Sources ·  │      │  Ingest · Chunk · Embed ·    │
│  React Query, Router │      │  Chat · Analytics · Prisma│      │  Retrieve · Grounded answers │
└──────────────────────┘      └─────────────┬─────────────┘      └──────────────┬───────────────┘
                                            │                                   │
                                            ▼                                   ▼
                                  ┌──────────────────────────────────────────────────────┐
                                  │        PostgreSQL 16 + pgvector (embeddings)         │
                                  └──────────────────────────────────────────────────────┘
                                                                                │
                                                          OpenAI · Gemini · Ollama (LLM + embeddings)
```

**How a grounded answer is made**

```
question ─▶ embed ─▶ pgvector top-k ─▶ label chunks [C1..Cn] ─▶ LLM returns JSON
   {answer, citations:[{ref, quote}], insufficient_evidence}
─▶ validate: drop unknown refs · take doc/page from DB · verify quotes · renumber [1],[2]
─▶ ANSWERED (with verified citations)  or  INSUFFICIENT_EVIDENCE
```

---

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, TanStack React Query, React Router 7, Recharts, react-markdown
- **API:** Node.js, Express 5, TypeScript, Prisma, Zod, JWT, bcrypt, Multer, Pino, Helmet
- **AI service:** Python 3.11, FastAPI, LangChain, pypdf, tiktoken, SQLAlchemy
- **Data:** PostgreSQL 16 + pgvector
- **Testing:** Jest + Supertest (Node), pytest (Python)
- **Infra:** Docker / Docker Compose

---

## Project structure

```
.
├── src/                 # React frontend (pages: Login, Dashboard, Sources, Chat, Insights, Admin)
├── server/              # Express API, Prisma schema & migrations, Jest tests
│   ├── prisma/
│   └── src/modules/     # auth, sources, chat, analytics, health
├── python-service/      # FastAPI RAG service
│   ├── app/routers/     # ingest, rag, grounded, summarize, health
│   ├── app/services/    # pdf, chunking, embedding, llm, grounded
│   └── tests/
└── testing/             # shared fixtures + 35-case manual test checklist
```

---

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL with the `pgvector` extension (or Docker)
- An OpenAI or Gemini API key, **or** a local [Ollama](https://ollama.com) install

### 1. Start PostgreSQL + pgvector

```bash
cd server
docker compose up -d postgres
```

### 2. AI service (FastAPI)

```bash
cd python-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set LLM_PROVIDER and API keys / Ollama URL
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. API server (Express)

```bash
cd server
npm install
# create server/.env with DATABASE_URL, JWT_SECRET, PY_AI_BASE_URL=http://localhost:8000
npx prisma migrate deploy && npx prisma generate
npm run dev
```

### 4. Frontend

```bash
npm install
npm run dev                     # http://localhost:5173
```

---

## Key API endpoints

**Node API** (`Authorization: Bearer <token>`, `x-workspace-id: <uuid>`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` · `/api/auth/login` | Create account / get JWT |
| POST | `/api/sources/pdf` | Upload and index a PDF |
| POST | `/api/sources/notes/upload` | Upload notes |
| GET / DELETE | `/api/sources` · `/api/sources/:id` | List / delete sources |
| POST | `/api/sources/:id/reindex` · `/:id/summarize` | Re-index / summarize a source |
| POST / GET | `/api/chat/sessions` · `/sessions/:id/messages` | Chat with citations |
| GET | `/api/analytics/dashboard` · `/insights` | Analytics |

**Python AI service**

| Method | Path | Description |
| --- | --- | --- |
| POST | `/ingest/pdf/extract` | Validate a PDF and extract text per page |
| POST | `/ingest/pdf` · `/ingest/notes/upload` | Chunk, embed, and store |
| POST | `/rag/chat` | Hybrid RAG chat |
| POST | `/rag/answer` | Evidence-only answer with verified page citations |
| POST | `/rag/summarize-document` | Grounded document summary |
| GET | `/health` | Service + DB health |

Example grounded answer:

```json
{
  "status": "ANSWERED",
  "answer": "The warranty covers manufacturing defects for 24 months [1].",
  "citations": [
    { "ordinal": 1, "documentId": "…", "title": "Product Manual.pdf", "page": 12,
      "excerpt": "…covers defects in materials and workmanship for 24 months…", "quoteVerified": true }
  ]
}
```

---

## Testing

```bash
# Node API (fully mocked: no DB or AI service needed)
cd server && npm test

# Python AI service
cd python-service
pip install -r requirements-dev.txt
pytest tests/ -v
```

The Python suite covers PDF extraction edge cases (encrypted, corrupt, and image-only files), citation validation, the grounded-answer API, chunking, and ingestion. See [`testing/TEST_CHECKLIST.md`](testing/TEST_CHECKLIST.md) for the 35-case manual test plan.

---

## Error handling & debugging

All three services share one error envelope:

```json
{
  "error": {
    "code": "PDF_EMPTY_FILE",
    "message": "This file appears to be empty.",
    "hint": "Upload a file with readable text.",
    "requestId": "a5d2…",
    "details": {}
  }
}
```

- Canonical codes live in `server/src/lib/error-codes.ts` and are mirrored in `python-service/app/errors.py`. Examples: `PDF_UNSUPPORTED_TYPE`, `PDF_EMPTY_FILE`, `EMBEDDING_FAILED`, `LLM_TIMEOUT`, `AI_SERVICE_DOWN`, `OLLAMA_UNAVAILABLE`, `DB_UNAVAILABLE`.
- Every request carries an `X-Request-ID` from the browser through Node to Python, so one ID traces a failure across all services.
- Errors are saved to an `error_logs` table (workspace, source type, endpoint, code, hint, metadata; stack trace only outside production), indexed for per-workspace debugging.
- The UI shows friendly messages with **Retry** actions on failed sources, and chat threads stay coherent even when the AI service fails.

---

## Roadmap

- [x] Grounded PDF answers with verified page citations
- [ ] Projects and document storage (in progress)
- [ ] Clickable citations that open the PDF at the cited page
- [ ] OCR for scanned / image-only PDFs
- [ ] One-command Docker Compose for the full stack

---

## Author

**Hadi Khan** · [GitHub @hadikhanhk786](https://github.com/hadikhanhk786)
