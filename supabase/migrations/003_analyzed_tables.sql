-- AI analysis result tables

CREATE TABLE IF NOT EXISTS analyzed_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id  UUID REFERENCES raw_articles(id) ON DELETE CASCADE,

  -- BigKinds NLP results
  big_category    TEXT,
  small_category  TEXT,
  region_category TEXT,
  keywords        TEXT[],
  entities        JSONB,

  -- Claude AI analysis results
  relevance_score NUMERIC(3,2),
  is_significant  BOOLEAN DEFAULT FALSE,
  significance_reason TEXT,

  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  sentiment_score NUMERIC(3,2),

  ai_summary      TEXT,

  -- Mappings
  related_province_codes TEXT[],
  related_candidate_ids  UUID[],
  related_agenda_ids     UUID[],
  related_issue_ids      UUID[],

  -- Trend
  trend_signal    TEXT CHECK (trend_signal IN ('rising', 'falling', 'stable', 'breaking')),
  trend_detail    TEXT,

  analyzed_at     TIMESTAMPTZ DEFAULT NOW(),
  analyzer_model  TEXT DEFAULT 'claude-sonnet-4-6'
);

CREATE TABLE IF NOT EXISTS candidate_sentiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID REFERENCES analyzed_articles(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES candidates(id),
  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  sentiment_score NUMERIC(3,2),
  context         TEXT,
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analyzed_articles_relevance ON analyzed_articles(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_analyzed_articles_significant ON analyzed_articles(is_significant) WHERE is_significant = TRUE;
CREATE INDEX IF NOT EXISTS idx_analyzed_articles_raw ON analyzed_articles(raw_article_id);
CREATE INDEX IF NOT EXISTS idx_candidate_sentiments_candidate ON candidate_sentiments(candidate_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_sentiments_article ON candidate_sentiments(article_id);
