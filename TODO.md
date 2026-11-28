# TODO

## YouTube removal
- [x] python-service: ingest/summarize endpoints, services, tests, youtube-transcript-api
- [x] server: youtube/summarize/reindex routes, controller, service, schemas, YT_ error codes, chat mode (reindex was YouTube-only)
- [x] UI: pages, buttons, source-type options, API calls (src/) incl. dead reindex/summarize calls
- [x] README/docs/testing checklist mentions (fixtures/chat-queries.json and sample-notes.md still mention YouTube)
- [x] python-service: YT_* error codes, llm.py YouTube prompt text/branch
- [x] python-service leftovers: `YOUTUBE` mode in rag.py/schemas (and tests/test_rag.py); also fixed NOTES mode 422 and HYBRID returning only half the chunks
- [x] python-service: `VideoSummary` model removed (video_summaries table cleanup is in the Prisma item below)
- [ ] Owner: Prisma schema cleanup (youtube source type/enum, video summary columns) + migration

- [x] testing/fixtures: dropped YOUTUBE entries from chat-queries.json and sample-notes.md

## Bugs
- [x] chat send-message schema didn't validate `sourceIds` (now must be a list of UUIDs)
- python-service/requirements.txt pins psycopg-binary 3.1.18 transitively (`psycopg[binary]==3.1.18`), which no longer installs on current Python indexes (found installing deps)
- Server tests need DATABASE_URL, JWT_SECRET, PY_AI_BASE_URL env vars set (not documented for tests)
- Root `npm run lint` still fails (~32 errors: mostly no-explicit-any; set-state-in-effect in ChatPage; fast-refresh exports in Toast/AuthContext; no-namespace in server auth.ts)
- [x] LoginPage: replaced `any` catch types (lint); api.ts now typed; axios.ts and audit.service.ts typed
- [x] removed unused vars in chat.service.ts and middleware/auth.ts (lint)
- [x] ChatPage toggleCitation used a ternary as a statement (lint no-unused-expressions)
- [x] mock-data audit log still mentioned youtube
- python tests can't be collected offline: need DATABASE_URL + OPENAI_API_KEY env vars and tiktoken downloads encodings at import (also sqlalchemy==2.0.28 pin breaks on newer Python typing)
- python tests using tiktoken need network to download encodings (fail offline)

## Features (keep simple)
- [x] **Owner request, do first:** Invite UI. Make the Admin page "Invite Member" button work:
  - server: `POST /api/auth/invites` `{ email, days? }`, signed-in **ADMIN only** (use middleware/rbac.ts),
    returns `{ link }` built with `createInvite()` from `server/src/lib/invite.ts` (same format as
    `server/src/scripts/invite.ts`; APP_URL env, default `https://hadikhanhk786.github.io/citewise`)
  - UI: modal with an email field and days (default 7) -> shows the link with a Copy button
  - tests: 403 for non-admin, 422 for bad email, link verifies with `inviteMatches()` for that email
  - no schema change; invites stay stateless (no list/revoke in this item)
  - [x] part 1: server endpoint + tests done
  - [x] part 2: Admin page modal (email + days, shows link with Copy button)
- [ ] Admin page lists real workspace members instead of `mockAdminUsers` (after the invite item)
- [ ] **Owner request, do first (after the invite UI):** Training library: the owner adds material from the UI
  (a link, a PDF, an HTML/Markdown/text file). It is indexed into the shared docs library right away (chat
  uses it in HYBRID/NOTES) and is exported for the Kaggle training-data notebook. ADMIN only. No new
  dependencies, no schema change: everything lives in `rag_chunks` under `settings.LIBRARY_WORKSPACE_ID`
  with `source_id = "lib:user:<slug>"` and metadata `{title, url, addedBy, addedAt}`. One step per commit:
  - [x] step 1 done (python-service endpoints + tests)
  - [x] step 2 done (server /api/library routes + tests)
  1. python-service: `POST /library/add` (multipart `file` OR form `url`, plus `title`): PDF via `PDFService`,
     HTML via the stdlib parser in `services/websearch.py`, md/txt as-is; chunk + embed like
     `scripts/build_library.py`. `GET /library/items` (distinct user-added sources with chunk counts) and
     `DELETE /library/items/{source_id}`. Tests with mocked embeddings.
  2. server: ADMIN-only `POST /api/library` (reuse middleware/upload.ts limits; allow .pdf/.html/.md/.txt),
     `GET /api/library`, `DELETE /api/library/:sourceId`, proxying to the python endpoints. Tests: 403 for
     non-admin, 422 for neither file nor url.
  3. UI: Admin page "Training library" panel: "Add link" field, file upload, list (title, chunks, date) with delete.
  4. Training export: python `GET /library/export` returning user-added items as JSONL `{source, title, url, text}`,
     protected by `Authorization: Bearer <GPU_TOKEN>`; Caddy route `/library/export` -> rag; then add a source to
     `kaggle/sft-data/build_notebook.py` that downloads it (SERVER + TOKEN already in the notebook) and chunks it
     like the other sources. Document it in kaggle/sft-data.
- Python tests can't be collected offline without a tiktoken stub (see above); test_chunking.py TestChunkTranscript errors under a stub (look into it)
- Delete a source, rename a chat, copy answer with citations
- Click a citation to open the PDF at that page
- Short local-setup guide
