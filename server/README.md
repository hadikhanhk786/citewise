# My Learning Copilot - Backend

Enterprise-grade Node.js backend for My Learning Copilot, handling authentication, source management, RAG chat, and AI service orchestration.

## Tech Stack

- **Runtime**: Node.js + Express
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT + RBAC
- **Validation**: Zod
- **Logging**: Pino

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for PostgreSQL)
- Python AI Service running (defaults to `http://localhost:8000`)

## Getting Started

1.  **Install Dependencies**:
    ```bash
    cd server
    npm install
    ```

2.  **Environment Setup**:
    Copy `.env` (already created) and adjust if necessary.
    ```bash
    cp .env.example .env
    ```

3.  **Start Database**:
    ```bash
    docker compose up -d postgres
    ```

4.  **Database Migration**:
    ```bash
    npx prisma migrate dev --name init
    ```

5.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account & workspace
- `POST /api/auth/login` - Get JWT
- `GET /api/me` - Get current user

### Sources
- `POST /api/sources/youtube`
  - **Request**: `{ "url": "https://youtu.be/dQw4w9WgXcQ" }`
  - **Context**: Requires `Authorization: Bearer <token>` and `x-workspace-id: <uuid>`
- `POST /api/sources/notes/upload` - Upload `.txt`/`.md`/`.pdf` notes (Multipart Form Data)
- `GET /api/sources` - List sources

### Chat
- `POST /api/chat/sessions` 
  - **Request**: `{ "title": "New Session", "mode": "HYBRID" }`
  - **Response**: `{ "session": { "id": "uuid", "title": "New Session" } }`
- `POST /api/chat/sessions/:id/messages` - Send message (triggers RAG)
  - **Request**: `{ "content": "What is AI?", "mode": "HYBRID" }`
  - **Response**: `{ "message": { "role": "assistant", "content": "AI is...", "metrics": [...] } }`

### Health
- `GET /api/health` - Check service status (includes Node liveness, Python Proxy Liveness, Postgres Connectivity)
