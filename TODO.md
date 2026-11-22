# TODO

## YouTube removal
- [x] python-service: ingest/summarize endpoints, services, tests, youtube-transcript-api
- [x] server: youtube/summarize/reindex routes, controller, service, schemas, YT_ error codes, chat mode (reindex was YouTube-only)
- [x] UI: pages, buttons, source-type options, API calls (src/) incl. dead reindex/summarize calls
- [x] README/docs/testing checklist mentions (fixtures/chat-queries.json and sample-notes.md still mention YouTube)
- [x] python-service: YT_* error codes, llm.py YouTube prompt text/branch
- [x] python-service leftovers: `YOUTUBE` mode in rag.py/schemas (and tests/test_rag.py); also fixed NOTES mode 422 and HYBRID returning only half the chunks
- [ ] python-service: `VideoSummary` model leftovers (if any)
- [ ] Owner: Prisma schema cleanup (youtube source type/enum, video summary columns) + migration

- [x] testing/fixtures: dropped YOUTUBE entries from chat-queries.json and sample-notes.md

## Bugs
- python-service/requirements.txt pins psycopg-binary 3.1.18 transitively (`psycopg[binary]==3.1.18`), which no longer installs on current Python indexes (found installing deps)
- Server tests need DATABASE_URL, JWT_SECRET, PY_AI_BASE_URL env vars set (not documented for tests)
- Root `npm run lint` fails with ~40 errors (mostly no-explicit-any)
- python tests can't be collected offline: need DATABASE_URL + OPENAI_API_KEY env vars and tiktoken downloads encodings at import (also sqlalchemy==2.0.28 pin breaks on newer Python typing)
- python tests using tiktoken need network to download encodings (fail offline)

## Features (keep simple)
- Delete a source, rename a chat, copy answer with citations
- Click a citation to open the PDF at that page
- Short local-setup guide
