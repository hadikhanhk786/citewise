# My Learning Copilot

PERN stack + Python FastAPI RAG service for YouTube transcript ingestion, notes upload, and hybrid chat with citations.

## How to Test Locally

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL with pgvector extension
- API key for Gemini or OpenAI (set in `python-service/.env`)

### 1. Node/Express Backend Tests (Jest + Supertest)

All backend tests use mocks — no running database or Python service required.

```bash
cd server
npm install
npm test
```

This runs all tests in `server/src/__tests__/`:
- `health.test.ts` — health endpoint with service status mocking
- `sources.test.ts` — YouTube ingestion, notes upload, source CRUD
- `chat.test.ts` — session management, message sending, RAG response mocking

To run a specific test file:

```bash
cd server
npx jest --testPathPattern="sources"
```

### 2. Python/FastAPI Tests (pytest)

Most tests use mocks. The chunking and YouTube URL tests are pure unit tests with no external deps.

```bash
cd python-service
pip install -r requirements.txt
pip install pytest pytest-asyncio

pytest tests/ -v
```

Test files:
- `test_health.py` — health endpoint, root endpoint, DB-down simulation
- `test_youtube_service.py` — URL parsing, transcript error handling
- `test_chunking.py` — text splitting, transcript chunking with timestamps
- `test_ingest.py` — YouTube/Notes ingestion validation (empty files, missing fields)
- `test_rag.py` — chat validation, strictSources, mode filtering, citation schema

To run a single test file:

```bash
pytest tests/test_chunking.py -v
```

### 3. Test Fixtures

Shared fixtures are in `testing/fixtures/`:
- `youtube-transcript.json` — 15-segment sample transcript
- `sample-notes.md` — RAG architecture notes document
- `chat-queries.json` — sample queries with expected citation structures

### 4. Manual Testing Checklist

See `testing/TEST_CHECKLIST.md` for a 47-case structured test plan covering:
- YouTube happy path + error cases
- Notes upload + edge cases
- Hybrid RAG chat + citation correctness
- strictSources behavior
- Health endpoints
- Infrastructure error handling

### 5. Error Response Shape

All endpoints return errors in a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR | HTTP_ERROR | INTERNAL_SERVER_ERROR",
    "message": "Human-readable description"
  }
}
```

Zod validation errors (Node) include a `details` array with field-level issues.

---

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Error handling & debugging

All three services (React, Node, Python) share a single error envelope so users
see friendly, actionable messages while operators still get enough detail to
debug an incident.

### Standard API error shape

Every failing API response from Node (and from the Python service) conforms to:

```json
{
  "error": {
    "code": "YT_TRANSCRIPT_UNAVAILABLE",
    "message": "We couldn't get subtitles for this video.",
    "hint": "Try another video with captions enabled.",
    "requestId": "a5d2…",
    "details": { }
  }
}
```

Canonical codes live in:
- `server/src/lib/error-codes.ts` — source of truth for Node + UI fallbacks
- `python-service/app/errors.py` — Python mirror (keep these in sync)

Examples: `YT_INVALID_URL`, `YT_TRANSCRIPT_UNAVAILABLE`, `PDF_UNSUPPORTED_TYPE`,
`PDF_EMPTY_FILE`, `EMBEDDING_FAILED`, `LLM_TIMEOUT`, `AI_SERVICE_DOWN`,
`DB_UNAVAILABLE`.

### Persistent error log (`error_logs` table)

Every error caught by the Node global error handler — plus ingestion and chat
failures — is persisted to the `error_logs` table:

| column        | notes                                             |
| ------------- | ------------------------------------------------- |
| `id`          | uuid                                              |
| `workspace_id`| nullable (for unauthenticated failures)           |
| `source_type` | `PDF` \| `YOUTUBE` \| `NOTES` \| `CHAT` \| `SYSTEM` |
| `source_id`   | nullable                                          |
| `endpoint`    | e.g. `/api/sources/pdf`                           |
| `error_code`  | canonical code                                    |
| `message`     | friendly message returned to the client          |
| `hint`        | optional next-step for the user                   |
| `request_id`  | same id echoed in the `X-Request-ID` header       |
| `metadata`    | jsonb — filename, url, mode, …                    |
| `stack_trace` | captured only when `NODE_ENV !== 'production'`    |
| `created_at`  | timestamp                                         |

Indexed on `(workspace_id, source_type, created_at DESC)` for fast per-workspace
debugging queries.

Migration: `server/prisma/migrations/20260409140000_add_error_logs`. Apply with:

```bash
cd server && npx prisma migrate deploy && npx prisma generate
```

> After running `prisma generate`, remove the `as any` casts and local
> `ErrorSourceType` shims in `errorLog.service.ts`, `sources.service.ts`, and
> `middleware/error-handler.ts` — the generated client exposes the real types.

### Request correlation

Every request gets an `X-Request-ID` (existing header passes through; otherwise
a uuid is generated). The Node axios client forwards it to the Python service,
Python logs it on every structured error, and the frontend surfaces it via the
`requestId` field in the error envelope so users can cite it in support.

### Frontend behavior

- `src/lib/errors.ts` — `parseApiError(err)` turns any axios failure into the
  canonical `ApiError` shape, with a fallback message map for network failures.
- `src/lib/axios.ts` attaches `error.apiError` on every rejection.
- **Sources page**: ERROR rows show an inline friendly message from
  `source.errorReason` and the normal Re-index button is replaced with a
  **Retry** button that clears `errorCode`/`errorReason` on success.
- **Chat page**: On failure we surface a toast and refetch messages — the Node
  chat service has already persisted a friendly fallback assistant message so
  the thread stays coherent.

### Friendly message mapping (examples)

| code                       | message                                              | hint                                              |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `YT_INVALID_URL`           | That doesn't look like a valid YouTube link.         | Please paste a full YouTube URL.                  |
| `YT_TRANSCRIPT_UNAVAILABLE`| We couldn't get subtitles for this video.            | Try another video with captions enabled.         |
| `PDF_EMPTY_FILE`           | This file appears to be empty.                       | Upload a file with readable text.                |
| `EMBEDDING_FAILED`         | We couldn't process your content right now.          | Please try again shortly.                         |
| `AI_SERVICE_DOWN`          | Our AI service is temporarily unavailable.           | Please try again in a few moments.               |

### Example log rows

```sql
SELECT source_type, error_code, endpoint, message, created_at
FROM error_logs
WHERE workspace_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

```
 source_type | error_code                | endpoint               | message
-------------+---------------------------+------------------------+----------------------------------------------------
 YOUTUBE     | YT_TRANSCRIPT_UNAVAILABLE | /api/sources/youtube   | We couldn't get subtitles for this video.
 PDF         | PDF_EMPTY_FILE            | /api/sources/pdf       | This file appears to be empty.
 CHAT        | LLM_TIMEOUT               | /api/chat              | The assistant took too long to respond.
 SYSTEM      | AI_SERVICE_DOWN           | /api/sources/pdf       | Our AI service is temporarily unavailable.
```
