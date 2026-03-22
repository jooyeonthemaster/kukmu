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
