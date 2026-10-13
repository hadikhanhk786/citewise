# My Learning Copilot — Test Checklist

> Generated for the testing & validation phase. Update **Actual Result** and **Status** as you execute each case.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| -      | Not run |
| PASS   | Passed  |
| FAIL   | Failed  |
| SKIP   | Skipped (blocked / N/A) |

---

## 1. YouTube Ingestion

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| YT-01 | YouTube happy path | Valid URL with transcript | `POST /api/sources/youtube` with `{ workspaceId, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }` | Source created with status `INDEXING`, async ingestion updates to `READY` | | - |
| YT-02 | YouTube happy path | Short URL form | `POST /api/sources/youtube` with `url: "https://youtu.be/dQw4w9WgXcQ"` | Same as YT-01 — video ID extracted correctly | | - |
| YT-03 | Invalid YouTube URL | Malformed URL | `POST /api/sources/youtube` with `url: "not-a-url"` | 422 Validation Error (Zod rejects invalid URL) | | - |
| YT-04 | Invalid YouTube URL | Non-YouTube URL | `POST /api/sources/youtube` with `url: "https://vimeo.com/12345"` | Python service returns 400 — invalid YouTube URL | | - |
| YT-05 | Missing transcript | Video with disabled captions | Valid YouTube URL with captions disabled | Python returns 400: "Transcripts are disabled for this video" | | - |
| YT-06 | Missing transcript | Video with no transcript available | Valid YouTube URL, no transcript | Python returns 400: "No transcript found for this video" | | - |
| YT-07 | Unavailable video | Private / deleted video | YouTube URL for unavailable video | Python returns 400: "Video is unavailable" | | - |
| YT-08 | Python service down | Network error during ingestion | Valid YouTube URL but Python service is offline | Source status set to `ERROR`, logged via aiClient retry logic | | - |
| YT-09 | Reindex | Reindex existing YouTube source | `POST /api/sources/:id/reindex?workspaceId=...` | Source status reset to `INDEXING`, new ingestion triggered | | - |
| YT-10 | Auth required | No Bearer token | `POST /api/sources/youtube` without Authorization header | 401 Unauthorized | | - |
| YT-11 | Workspace guard | User not member of workspace | Valid token, workspaceId user is not a member of | 403 Forbidden | | - |

---

## 2. Notes Upload

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| NT-01 | Notes happy path | Valid markdown file | `POST /api/sources/notes/upload` with `.md` file + workspaceId | Source created with status `INDEXING`, async ingestion updates to `READY` | | - |
| NT-02 | Notes happy path | Valid text file | `.txt` file upload | Same as NT-01 | | - |
| NT-03 | Empty file | Upload empty file | Empty `.md` file | Python returns 400: "File is empty or contains no readable text" | | - |
| NT-04 | No file attached | Missing file in multipart | POST without file field | 400: "No file uploaded" from Node controller | | - |
| NT-05 | Unsupported file type | Binary / image file | Upload `.png` or `.exe` file | Python fails to decode as UTF-8 — 500 or Node-side validation rejects | | - |
| NT-06 | Python service down | Network error during ingestion | Valid file but Python offline | Source status set to `ERROR`, error logged | | - |
| NT-07 | Auth required | No Bearer token | Upload without Authorization header | 401 Unauthorized | | - |
| NT-08 | Large file | File with many tokens | Large `.md` file (50KB+) | Chunked correctly, multiple RagChunks created | | - |

---

## 3. Hybrid RAG Chat

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| CH-01 | Chat happy path | HYBRID mode with indexed sources | `POST /api/chat/sessions/:id/messages` with `{ content: "What is discussed?", mode: "HYBRID" }` | Returns `{ userMessage, assistantMessage }` with answer and citations | | - |
| CH-02 | Chat happy path | YOUTUBE mode only | Same request with `mode: "YOUTUBE"` | Citations only from YOUTUBE source type | | - |
| CH-03 | Chat happy path | NOTES mode only | Same request with `mode: "NOTES"` | Citations only from NOTES source type | | - |
| CH-04 | Empty content | Empty message body | `content: ""` | 422 Validation Error (min 1 char) | | - |
| CH-05 | Session not found | Invalid session ID | Non-existent UUID as session ID | 404 Session not found | | - |
| CH-06 | Session ownership | Another user's session | Valid session ID belonging to different user | 404 Session not found | | - |
| CH-07 | Python service down | RAG service unavailable | Valid message but Python offline | Error propagated via aiClient — 502/503 | | - |
| CH-08 | Create session | New chat session | `POST /api/chat/sessions` with `{ workspaceId, mode: "HYBRID" }` | Session created with mode HYBRID, title "New Chat" | | - |
| CH-09 | List sessions | Fetch user sessions | `GET /api/chat/sessions?workspaceId=...` | Returns up to 50 sessions ordered by createdAt DESC | | - |
| CH-10 | Get messages | Fetch session history | `GET /api/chat/sessions/:id/messages` | Returns messages ordered by createdAt ASC | | - |

---

## 4. Citation Correctness

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| CT-01 | YouTube citation | Chat against YouTube source | Query about YouTube content | Citation includes `sourceType: "YOUTUBE"`, `timestampStart`, `timestampEnd`, `snippet` | | - |
| CT-02 | Notes citation | Chat against Notes source | Query about notes content | Citation includes `sourceType: "NOTES"`, `title` (filename), `snippet` | | - |
| CT-03 | Hybrid citations | Chat in HYBRID mode | Query matching both sources | Mix of YouTube and Notes citations returned | | - |
| CT-04 | Citation structure | Schema validation | Any chat response with citations | Each citation has: `sourceType`, `title`, `sourceId`, `docId`, `snippet` | | - |

---

## 5. strictSources Behavior

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| SS-01 | strictSources=true | No matching chunks | `strictSources: true` with query that has no relevant chunks | Returns "No relevant information found in the provided sources." with empty citations | | - |
| SS-02 | strictSources=false | No matching chunks | `strictSources: false` with same query | LLM generates response (may hallucinate), empty or minimal citations | | - |
| SS-03 | strictSources=true | Matching chunks exist | `strictSources: true` with relevant query | Normal response with citations | | - |

---

## 6. Health Endpoints

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| HE-01 | Node health | All services healthy | `GET /api/health` | 200 `{ status: "ok", services: { api: "ok", db: "ok", ai: "ok" } }` | | - |
| HE-02 | Node health | DB down | `GET /api/health` with Postgres offline | 200 `{ status: "degraded", services: { db: "down" } }` | | - |
| HE-03 | Node health | Python service down | `GET /api/health` with Python offline | 200 `{ status: "degraded", services: { ai: "down" } }` | | - |
| HE-04 | Python health | All ok | `GET /health` on Python service | 200 `{ status: "ok", provider: "...", db: "ok", embeddings: "ok" }` | | - |
| HE-05 | Python health | DB unavailable | `GET /health` with Postgres offline | 200 with `db: "error"` | | - |

---

## 7. Infrastructure & Error Handling

| ID | Feature | Scenario | Input | Expected Result | Actual Result | Status |
|----|---------|----------|-------|-----------------|---------------|--------|
| IF-01 | Missing API key | No GEMINI_API_KEY / OPENAI_API_KEY | Start Python service without API key env | Embedding/LLM calls fail with 502, health shows embeddings degraded | | - |
| IF-02 | Postgres unavailable | DB connection refused | Start Node server without Postgres | Prisma operations fail, health reports DB down | | - |
| IF-03 | 404 route | Unknown API route | `GET /api/unknown` | 404 `{ error: "Not Found" }` | | - |
| IF-04 | Validation error | Invalid UUID | `workspaceId: "not-a-uuid"` | 422 with Zod validation details | | - |
| IF-05 | Error response shape | Any error response | Trigger any error | Consistent shape: `{ error: { code, message } }` | | - |
| IF-06 | Request ID propagation | Any request | Send request with `X-Request-ID` header | Same ID appears in logs and Python service calls | | - |

---

## Summary

| Category | Total | Pass | Fail | Skip | Not Run |
|----------|-------|------|------|------|---------|
| YouTube Ingestion | 11 | | | | 11 |
| Notes Upload | 8 | | | | 8 |
| Hybrid RAG Chat | 10 | | | | 10 |
| Citation Correctness | 4 | | | | 4 |
| strictSources | 3 | | | | 3 |
| Health Endpoints | 5 | | | | 5 |
| Infrastructure | 6 | | | | 6 |
| **Total** | **47** | | | | **47** |
