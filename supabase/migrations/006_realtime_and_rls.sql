-- Realtime: enable for 5 tables used by frontend hooks
ALTER PUBLICATION supabase_realtime ADD TABLE polls;
ALTER PUBLICATION supabase_realtime ADD TABLE poll_results;
ALTER PUBLICATION supabase_realtime ADD TABLE hot_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE analyzed_articles;
ALTER PUBLICATION supabase_realtime ADD TABLE agendas;

-- RLS: enable on all 18 tables
ALTER TABLE raw_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyzed_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sentiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

-- RLS policies: public SELECT for frontend-facing tables
CREATE POLICY "공개 읽기: provinces" ON provinces FOR SELECT USING (true);
CREATE POLICY "공개 읽기: districts" ON districts FOR SELECT USING (true);
CREATE POLICY "공개 읽기: candidates" ON candidates FOR SELECT USING (true);
CREATE POLICY "공개 읽기: polls" ON polls FOR SELECT USING (true);
CREATE POLICY "공개 읽기: poll_results" ON poll_results FOR SELECT USING (true);
CREATE POLICY "공개 읽기: poll_trends" ON poll_trends FOR SELECT USING (true);
CREATE POLICY "공개 읽기: issues" ON issues FOR SELECT USING (true);
CREATE POLICY "공개 읽기: analyzed_articles" ON analyzed_articles FOR SELECT USING (true);
CREATE POLICY "공개 읽기: candidate_sentiments" ON candidate_sentiments FOR SELECT USING (true);
CREATE POLICY "공개 읽기: ministers" ON ministers FOR SELECT USING (true);
CREATE POLICY "공개 읽기: agendas" ON agendas FOR SELECT USING (true);
CREATE POLICY "공개 읽기: agenda_tracking" ON agenda_tracking FOR SELECT USING (true);
CREATE POLICY "공개 읽기: stock_impacts" ON stock_impacts FOR SELECT USING (true);
CREATE POLICY "공개 읽기: hot_topics" ON hot_topics FOR SELECT USING (true);
CREATE POLICY "공개 읽기: daily_briefings" ON daily_briefings FOR SELECT USING (true);

-- raw_* tables: NO SELECT policy = anon blocked
-- service_role bypasses RLS automatically = no write policies needed
