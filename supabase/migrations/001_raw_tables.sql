-- Raw data tables (before AI analysis)

CREATE TABLE IF NOT EXISTS raw_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  source_id       TEXT,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  summary         TEXT,
  author          TEXT,
  publisher       TEXT,
  published_at    TIMESTAMPTZ,
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE,
  UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS raw_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nesdc_id        INTEGER UNIQUE,
  election_type   TEXT,
  region          TEXT,
  pollster        TEXT NOT NULL,
  commissioner    TEXT,
  survey_start    DATE,
  survey_end      DATE,
  method          TEXT,
  sample_size     INTEGER,
  margin_of_error NUMERIC(3,1),
  response_rate   NUMERIC(5,2),
  raw_html        TEXT,
  raw_results     JSONB,
  pdf_urls        TEXT[],
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS raw_community_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  source_id       TEXT,
  url             TEXT,
  title           TEXT,
  body            TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,
  upvotes         INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE,
  UNIQUE(source, source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_articles_source ON raw_articles(source, source_id);
CREATE INDEX IF NOT EXISTS idx_raw_articles_collected ON raw_articles(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_articles_unanalyzed ON raw_articles(is_analyzed) WHERE is_analyzed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_polls_nesdc ON raw_polls(nesdc_id);
