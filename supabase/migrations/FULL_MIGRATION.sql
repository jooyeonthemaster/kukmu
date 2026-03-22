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
-- Election data tables

CREATE TABLE IF NOT EXISTS provinces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  name_en         TEXT,
  population      INTEGER,
  voter_count     INTEGER,
  council_seats   INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS districts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  province_id     UUID REFERENCES provinces(id),
  name            TEXT NOT NULL,
  population      INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),
  nec_id          TEXT,
  name            TEXT NOT NULL,
  party           TEXT NOT NULL,
  age             INTEGER,
  is_incumbent    BOOLEAN DEFAULT FALSE,
  career          TEXT[],
  pledges         TEXT[],
  photo_url       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(province_id, name, party)
);

CREATE TABLE IF NOT EXISTS polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_poll_id     UUID REFERENCES raw_polls(id),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),
  pollster        TEXT NOT NULL,
  commissioner    TEXT,
  survey_date     DATE NOT NULL,
  method          TEXT,
  sample_size     INTEGER,
  margin_of_error NUMERIC(3,1),
  response_rate   NUMERIC(5,2),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id         UUID REFERENCES polls(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES candidates(id),
  percentage      NUMERIC(4,1) NOT NULL,
  rank            INTEGER,
  UNIQUE(poll_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS poll_trends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  candidate_id    UUID REFERENCES candidates(id),
  date            DATE NOT NULL,
  avg_percentage  NUMERIC(4,1),
  poll_count      INTEGER,
  trend_direction TEXT CHECK (trend_direction IN ('up', 'down', 'stable')),
  change_amount   NUMERIC(4,1),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(province_id, candidate_id, date)
);

CREATE TABLE IF NOT EXISTS issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category        TEXT,
  first_detected  TIMESTAMPTZ DEFAULT NOW(),
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  mention_count   INTEGER DEFAULT 1,
  related_articles UUID[],
  is_active       BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_polls_province_date ON polls(province_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_poll_results_candidate ON poll_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_poll_trends_lookup ON poll_trends(province_id, candidate_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_issues_province ON issues(province_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_candidates_province ON candidates(province_id);
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
-- Government/policy tracking tables

CREATE TABLE IF NOT EXISTS ministers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  ministry        TEXT NOT NULL,
  position        TEXT,
  photo_url       TEXT,
  fulfillment_rate NUMERIC(5,2) DEFAULT 0,
  tracked_agendas INTEGER DEFAULT 0,
  trend           TEXT CHECK (trend IN ('up', 'down', 'stable')),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  ministry        TEXT NOT NULL,
  minister_name   TEXT,
  status          TEXT CHECK (status IN ('proposed', 'discussing', 'decided', 'implementing', 'completed')),
  date            DATE,
  category        TEXT,
  priority        TEXT CHECK (priority IN ('urgent', 'normal', 'low')),
  description     TEXT,
  meeting_number  INTEGER,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id       UUID REFERENCES agendas(id),
  status_before   TEXT,
  status_after    TEXT,
  tracked_at      TIMESTAMPTZ DEFAULT NOW(),
  source          TEXT,
  note            TEXT
);

CREATE TABLE IF NOT EXISTS stock_impacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code      TEXT NOT NULL,
  stock_name      TEXT NOT NULL,
  sector          TEXT,
  related_agenda_id UUID REFERENCES agendas(id),
  related_policy  TEXT,
  impact_score    INTEGER CHECK (impact_score BETWEEN -100 AND 100),
  direction       TEXT CHECK (direction IN ('up', 'down', 'neutral')),
  price_change    NUMERIC(5,2),
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hot_topics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword         TEXT UNIQUE NOT NULL,
  count           INTEGER DEFAULT 1,
  trend           TEXT CHECK (trend IN ('up', 'down', 'stable', 'new')),
  related_ministry TEXT,
  category        TEXT,
  first_seen      TIMESTAMPTZ DEFAULT NOW(),
  last_seen       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_briefings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE UNIQUE NOT NULL,
  summary         TEXT,
  key_findings    JSONB,
  risk_alerts     JSONB,
  province_highlights JSONB,
  stats           JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agendas_status ON agendas(status);
CREATE INDEX IF NOT EXISTS idx_agendas_date ON agendas(date DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_tracking_agenda ON agenda_tracking(agenda_id);
CREATE INDEX IF NOT EXISTS idx_stock_impacts_agenda ON stock_impacts(related_agenda_id);
CREATE INDEX IF NOT EXISTS idx_hot_topics_count ON hot_topics(count DESC);
-- Views for common queries

CREATE OR REPLACE VIEW v_latest_polls AS
SELECT DISTINCT ON (p.province_id, pr.candidate_id)
  p.province_id,
  prov.name AS province_name,
  prov.code AS province_code,
  pr.candidate_id,
  c.name AS candidate_name,
  c.party,
  pr.percentage,
  p.pollster,
  p.survey_date,
  p.sample_size,
  p.margin_of_error
FROM polls p
JOIN poll_results pr ON p.id = pr.poll_id
JOIN candidates c ON pr.candidate_id = c.id
JOIN provinces prov ON p.province_id = prov.id
ORDER BY p.province_id, pr.candidate_id, p.survey_date DESC;

CREATE OR REPLACE VIEW v_candidate_sentiment_trend AS
SELECT
  cs.candidate_id,
  c.name AS candidate_name,
  c.party,
  DATE_TRUNC('day', cs.analyzed_at)::DATE AS date,
  AVG(cs.sentiment_score)::NUMERIC(3,2) AS avg_sentiment,
  COUNT(*) AS article_count
FROM candidate_sentiments cs
JOIN candidates c ON cs.candidate_id = c.id
GROUP BY cs.candidate_id, c.name, c.party, DATE_TRUNC('day', cs.analyzed_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW v_province_poll_summary AS
SELECT
  prov.code AS province_code,
  prov.name AS province_name,
  c.name AS candidate_name,
  c.party,
  pt.avg_percentage,
  pt.trend_direction,
  pt.change_amount,
  pt.date AS trend_date
FROM poll_trends pt
JOIN provinces prov ON pt.province_id = prov.id
JOIN candidates c ON pt.candidate_id = c.id
WHERE pt.date = (SELECT MAX(date) FROM poll_trends WHERE province_id = pt.province_id)
ORDER BY prov.code, pt.avg_percentage DESC;

CREATE OR REPLACE VIEW v_recent_significant_news AS
SELECT
  aa.id,
  ra.title,
  ra.url,
  ra.publisher,
  ra.published_at,
  aa.ai_summary,
  aa.sentiment,
  aa.sentiment_score,
  aa.keywords,
  aa.trend_signal,
  aa.trend_detail,
  aa.related_province_codes
FROM analyzed_articles aa
JOIN raw_articles ra ON aa.raw_article_id = ra.id
WHERE aa.is_significant = TRUE
ORDER BY ra.published_at DESC
LIMIT 50;

-- Function to update poll trends (called after new poll insertion)
CREATE OR REPLACE FUNCTION update_poll_trends_for_province(p_province_id UUID)
RETURNS VOID AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT pr.candidate_id
    FROM polls p
    JOIN poll_results pr ON p.id = pr.poll_id
    WHERE p.province_id = p_province_id
  LOOP
    INSERT INTO poll_trends (province_id, candidate_id, date, avg_percentage, poll_count, trend_direction, change_amount)
    SELECT
      p_province_id,
      rec.candidate_id,
      CURRENT_DATE,
      AVG(pr.percentage)::NUMERIC(4,1),
      COUNT(*)::INTEGER,
      CASE
        WHEN AVG(pr.percentage) > COALESCE(
          (SELECT avg_percentage FROM poll_trends
           WHERE province_id = p_province_id AND candidate_id = rec.candidate_id
           ORDER BY date DESC LIMIT 1 OFFSET 0), AVG(pr.percentage)
        ) THEN 'up'
        WHEN AVG(pr.percentage) < COALESCE(
          (SELECT avg_percentage FROM poll_trends
           WHERE province_id = p_province_id AND candidate_id = rec.candidate_id
           ORDER BY date DESC LIMIT 1 OFFSET 0), AVG(pr.percentage)
        ) THEN 'down'
        ELSE 'stable'
      END,
      (AVG(pr.percentage) - COALESCE(
        (SELECT avg_percentage FROM poll_trends
         WHERE province_id = p_province_id AND candidate_id = rec.candidate_id
         ORDER BY date DESC LIMIT 1 OFFSET 0), AVG(pr.percentage)
      ))::NUMERIC(4,1)
    FROM polls p
    JOIN poll_results pr ON p.id = pr.poll_id
    WHERE p.province_id = p_province_id
      AND pr.candidate_id = rec.candidate_id
      AND p.survey_date >= CURRENT_DATE - INTERVAL '14 days'
    ON CONFLICT (province_id, candidate_id, date)
    DO UPDATE SET
      avg_percentage = EXCLUDED.avg_percentage,
      poll_count = EXCLUDED.poll_count,
      trend_direction = EXCLUDED.trend_direction,
      change_amount = EXCLUDED.change_amount;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to update hot topics
CREATE OR REPLACE FUNCTION refresh_hot_topics()
RETURNS VOID AS $$
BEGIN
  -- Update counts from recent analyzed articles (last 7 days)
  INSERT INTO hot_topics (keyword, count, trend, category, first_seen, last_seen)
  SELECT
    unnest(aa.keywords) AS keyword,
    COUNT(*) AS count,
    'new' AS trend,
    aa.big_category AS category,
    MIN(ra.published_at) AS first_seen,
    MAX(ra.published_at) AS last_seen
  FROM analyzed_articles aa
  JOIN raw_articles ra ON aa.raw_article_id = ra.id
  WHERE aa.is_significant = TRUE
    AND ra.published_at >= NOW() - INTERVAL '7 days'
    AND aa.keywords IS NOT NULL
  GROUP BY unnest(aa.keywords), aa.big_category
  ON CONFLICT (keyword)
  DO UPDATE SET
    count = EXCLUDED.count,
    trend = CASE
      WHEN hot_topics.count < EXCLUDED.count THEN 'up'
      WHEN hot_topics.count > EXCLUDED.count THEN 'down'
      ELSE 'stable'
    END,
    last_seen = EXCLUDED.last_seen;
END;
$$ LANGUAGE plpgsql;
