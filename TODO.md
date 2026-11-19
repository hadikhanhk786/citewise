# TODO

## YouTube removal
- [x] python-service: ingest/summarize endpoints, services, tests, youtube-transcript-api
- [x] server: youtube/summarize/reindex routes, controller, service, schemas, YT_ error codes, chat mode (reindex was YouTube-only)
- [x] UI: pages, buttons, source-type options, API calls (src/) incl. dead reindex/summarize calls
- [x] README/docs/testing checklist mentions (fixtures/chat-queries.json and sample-notes.md still mention YouTube)
- [ ] python-service leftovers: `YOUTUBE` mode in rag.py/schemas, YT_* error codes, llm.py YouTube prompt text, `VideoSummary` model
- [ ] Owner: Prisma schema cleanup (youtube source type/enum, video summary columns) + migration

- [ ] testing/fixtures: drop YOUTUBE entries from chat-queries.json and sample-notes.md

## Bugs
- python-service/requirements.txt pins psycopg-binary 3.1.18 transitively (`psycopg[binary]==3.1.18`), which no longer installs on current Python indexes (found installing deps)
- Server tests need DATABASE_URL, JWT_SECRET, PY_AI_BASE_URL env vars set (not documented for tests)
- Root `npm run lint` fails with ~40 errors (mostly no-explicit-any)
- python tests using tiktoken need network to download encodings (fail offline)

## Features (keep simple)
- Delete a source, rename a chat, copy answer with citations
- Click a citation to open the PDF at that page
- Short local-setup guide
