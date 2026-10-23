CREATE TABLE IF NOT EXISTS rt_bench (
  id              TEXT PRIMARY KEY,
  entity_id       TEXT NOT NULL,
  term_starts_at  INTEGER NOT NULL,
  term_ends_at    INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_rt_bench_active ON rt_bench(active, term_ends_at);

CREATE TABLE IF NOT EXISTS rt_audit_checkpoints (
  id           TEXT PRIMARY KEY,
  last_row_id  TEXT NOT NULL,
  last_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rt_reconsiders (
  id                     TEXT PRIMARY KEY,
  original_resolution_id TEXT NOT NULL,
  reconsider_proposal_id TEXT NOT NULL,
  triggered_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_reconsiders_res ON rt_reconsiders(original_resolution_id);

CREATE TABLE IF NOT EXISTS rt_reconsider_signatures (
  original_resolution_id TEXT NOT NULL,
  entity_id              TEXT NOT NULL,
  signed_at              INTEGER NOT NULL,
  PRIMARY KEY (original_resolution_id, entity_id)
);
