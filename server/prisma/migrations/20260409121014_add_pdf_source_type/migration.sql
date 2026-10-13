-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('YOUTUBE', 'NOTES', 'PDF');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('INDEXING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "NoteProvider" AS ENUM ('LOCAL', 'NOTION');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('YOUTUBE_TRANSCRIPT', 'NOTE', 'PDF_DOCUMENT');

-- CreateEnum
CREATE TYPE "ChatMode" AS ENUM ('YOUTUBE', 'NOTES', 'PDF', 'HYBRID');

-- CreateEnum
CREATE TYPE "Sender" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "external_id" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'INDEXING',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_documents" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "page_count" INTEGER,
    "byte_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_videos" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "transcript_cached" BOOLEAN NOT NULL DEFAULT false,
    "summary_cached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_collections" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "collection_name" TEXT NOT NULL,
    "provider" "NoteProvider" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "ChatMode" NOT NULL DEFAULT 'HYBRID',
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sender" "Sender" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pdf_documents_source_id_key" ON "pdf_documents"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_videos_source_id_key" ON "youtube_videos"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "notes_collections_source_id_key" ON "notes_collections"("source_id");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_documents" ADD CONSTRAINT "pdf_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_collections" ADD CONSTRAINT "notes_collections_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
