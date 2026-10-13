-- CreateEnum
CREATE TYPE "ErrorSourceType" AS ENUM ('PDF', 'YOUTUBE', 'NOTES', 'CHAT', 'SYSTEM');

-- AlterTable
ALTER TABLE "sources"
  ADD COLUMN "error_code"   TEXT,
  ADD COLUMN "error_reason" TEXT;

-- CreateTable
CREATE TABLE "error_logs" (
    "id"           TEXT NOT NULL,
    "workspace_id" TEXT,
    "source_type"  "ErrorSourceType" NOT NULL,
    "source_id"    TEXT,
    "endpoint"     TEXT NOT NULL,
    "error_code"   TEXT NOT NULL,
    "message"      TEXT NOT NULL,
    "hint"         TEXT,
    "request_id"   TEXT,
    "metadata"     JSONB,
    "stack_trace"  TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_workspace_id_source_type_created_at_idx"
  ON "error_logs"("workspace_id", "source_type", "created_at" DESC);
