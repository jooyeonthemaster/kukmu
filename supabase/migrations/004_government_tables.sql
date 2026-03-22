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
