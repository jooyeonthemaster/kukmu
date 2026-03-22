-- 007_deep_data.sql
-- Phase 1: Deep data schema additions for enriched candidate/article data

-- New columns on candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS bio_summary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Junction table: articles <-> candidates (many-to-many with context)
CREATE TABLE IF NOT EXISTS article_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id UUID REFERENCES raw_articles(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  mention_type TEXT CHECK (mention_type IN ('direct_quote', 'mention', 'analysis')),
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raw_article_id, candidate_id)
);

-- Junction table: articles <-> issues
CREATE TABLE IF NOT EXISTS article_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id UUID REFERENCES raw_articles(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raw_article_id, issue_id)
);

-- Full article body column
ALTER TABLE raw_articles ADD COLUMN IF NOT EXISTS full_body TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_article_candidates_candidate ON article_candidates(candidate_id);
CREATE INDEX IF NOT EXISTS idx_article_candidates_article ON article_candidates(raw_article_id);
CREATE INDEX IF NOT EXISTS idx_article_issues_issue ON article_issues(issue_id);
CREATE INDEX IF NOT EXISTS idx_candidates_slug ON candidates(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_active ON candidates(is_active) WHERE is_active = TRUE;

-- RLS
ALTER TABLE article_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "공개 읽기: article_candidates" ON article_candidates FOR SELECT USING (true);
CREATE POLICY "공개 읽기: article_issues" ON article_issues FOR SELECT USING (true);

-- Realtime for article_candidates
ALTER PUBLICATION supabase_realtime ADD TABLE article_candidates;
