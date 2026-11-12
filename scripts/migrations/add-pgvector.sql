-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column for embeddings (1024 dimensions = BAAI/bge-m3)
-- scripts/add-pgvector.sh uses EMBEDDING_DIMENSIONS instead of this hardcoded value
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON chunks
  USING hnsw (embedding vector_cosine_ops);
