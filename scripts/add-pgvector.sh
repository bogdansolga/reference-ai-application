#!/usr/bin/env bash
set -euo pipefail

# Load DATABASE_URL from .env.local
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

DB_NAME="rag_training"
# Must match the embedding model's output size (bge-m3 = 1024, text-embedding-3-small = 1536)
EMBEDDING_DIMENSIONS="${EMBEDDING_DIMENSIONS:-1024}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/migrations/add-pgvector.sql"

echo "Running pgvector setup..."

# CREATE EXTENSION requires superuser — run as local superuser against the DB
echo "Enabling pgvector extension (as superuser)..."
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || \
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Remaining setup (ALTER TABLE, CREATE INDEX) runs as the app user
echo "Adding vector(${EMBEDDING_DIMENSIONS}) column and HNSW index..."
psql "$DATABASE_URL" -c "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIMENSIONS});"
psql "$DATABASE_URL" -c "CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);"

echo "pgvector setup complete."
