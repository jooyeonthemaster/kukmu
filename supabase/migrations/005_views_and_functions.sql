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
