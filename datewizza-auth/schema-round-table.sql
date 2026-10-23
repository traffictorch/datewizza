-- Round Table — v1 schema
-- No admin table. By design.

CREATE TABLE IF NOT EXISTS rt_entities (
  entity_id           TEXT PRIMARY KEY,
  eligible_since      INTEGER NOT NULL,
  passkey_registered  INTEGER NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS rt_proposals (
  id               TEXT PRIMARY KEY,
  author_entity_id TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  body_md          TEXT NOT NULL,
  kind             TEXT NOT NULL,
  category         TEXT NOT NULL,
  phase            TEXT NOT NULL DEFAULT 'draft',
  created_at       INTEGER NOT NULL,
  vote_starts_at   INTEGER,
  vote_ends_at     INTEGER,
  quorum_pct       REAL NOT NULL DEFAULT 0.20,
  threshold_pct    REAL NOT NULL DEFAULT 0.66,
  block_pct        REAL NOT NULL DEFAULT 0.25,
  eligible_count   INTEGER,
  resolution_id    TEXT
);

CREATE TABLE IF NOT EXISTS rt_votes (
  proposal_id  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  choice       TEXT,
  commitment   TEXT,
  cast_at      INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, entity_id)
);

CREATE TABLE IF NOT EXISTS rt_comments (
  id          TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  parent_id   TEXT,
  body_md     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS rt_objections (
  id             TEXT PRIMARY KEY,
  proposal_id    TEXT NOT NULL,
  bench_entity   TEXT NOT NULL,
  reason_md      TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rt_resolutions (
  id           TEXT PRIMARY KEY,
  proposal_id  TEXT NOT NULL UNIQUE,
  outcome      TEXT NOT NULL,
  tally_json   TEXT NOT NULL,
  prev_hash    TEXT,
  this_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rt_audit_chain (
  row_id      TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  prev_hash   TEXT,
  this_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rt_proposals_phase ON rt_proposals(phase);
CREATE INDEX IF NOT EXISTS idx_rt_votes_proposal  ON rt_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_rt_comments_prop   ON rt_comments(proposal_id, created_at);
