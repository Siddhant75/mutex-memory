CREATE TABLE IF NOT EXISTS memory_episodes (
  id UUID PRIMARY KEY,
  case_id UUID NULL REFERENCES cases(id),
  summary STRING NOT NULL,
  resolution STRING NOT NULL,
  outcome STRING NOT NULL,
  metadata JSONB NOT NULL,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  VECTOR INDEX memory_episodes_embedding_idx (embedding vector_cosine_ops)
);
