/**
 * Trend Detector Task
 *
 * Trigger.dev task for detecting significant trend changes across polls,
 * sentiment, emerging issues, and breaking news patterns.
 */
import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendSignal {
  type: "poll_shift" | "sentiment_shift" | "issue_emerging" | "breaking_news";
  severity: "critical" | "high" | "medium" | "low";
  provinceCode?: string;
  candidateName?: string;
  description: string;
  evidence: string[];
  detectedAt: string;
}

interface DetectTrendsPayload {
  // Empty -- runs on schedule
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

function getSeverity(magnitude: number, thresholds: [number, number, number]): TrendSignal["severity"] {
  if (magnitude >= thresholds[0]) return "critical";
  if (magnitude >= thresholds[1]) return "high";
  if (magnitude >= thresholds[2]) return "medium";
  return "low";
}

/**
 * Rule 1: Poll shift -- change_amount > 3.0 or < -3.0 in last 24h
 */
async function detectPollShifts(supabase: SupabaseClient): Promise<TrendSignal[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("poll_trends")
    .select("candidate_name, party, province_code, percentage, change_amount, surveyed_at")
    .gte("surveyed_at", since)
    .or("change_amount.gt.3,change_amount.lt.-3")
    .order("change_amount", { ascending: true });

  if (error) {
    logger.error("Failed to query poll_trends", { error: error.message });
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map(
    (row: {
      candidate_name: string;
      party: string;
      province_code: string;
      percentage: number;
      change_amount: number;
      surveyed_at: string;
    }) => {
      const absChange = Math.abs(row.change_amount);
      const direction = row.change_amount > 0 ? "상승" : "하락";

      return {
        type: "poll_shift" as const,
        severity: getSeverity(absChange, [7, 5, 3]),
        provinceCode: row.province_code,
        candidateName: row.candidate_name,
        description: `${row.candidate_name}(${row.party}) ${row.province_code} 지지율 ${direction} ${absChange.toFixed(1)}%p (현재 ${row.percentage}%)`,
        evidence: [
          `여론조사 변동: ${row.change_amount > 0 ? "+" : ""}${row.change_amount.toFixed(1)}%p`,
          `조사일시: ${row.surveyed_at}`,
        ],
        detectedAt: new Date().toISOString(),
      };
    },
  );
}

/**
 * Rule 2: Sentiment shift -- avg sentiment changed > 0.3 in 24h
 */
async function detectSentimentShifts(supabase: SupabaseClient): Promise<TrendSignal[]> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  // Get recent 24h sentiments
  const { data: recentData, error: recentError } = await supabase
    .from("candidate_sentiments")
    .select("candidate_name, sentiment_score, analyzed_at")
    .gte("analyzed_at", since24h);

  if (recentError || !recentData || recentData.length === 0) return [];

  // Get previous 24h sentiments (24h-48h ago)
  const { data: prevData, error: prevError } = await supabase
    .from("candidate_sentiments")
    .select("candidate_name, sentiment_score, analyzed_at")
    .gte("analyzed_at", since48h)
    .lt("analyzed_at", since24h);

  if (prevError || !prevData || prevData.length === 0) return [];

  // Calculate average sentiment per candidate for each period
  type SentimentRow = { candidate_name: string; sentiment_score: number };
  const avgByCandidate = (rows: SentimentRow[]) => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      const entry = map.get(row.candidate_name) ?? { sum: 0, count: 0 };
      entry.sum += row.sentiment_score;
      entry.count += 1;
      map.set(row.candidate_name, entry);
    }
    const result = new Map<string, number>();
    for (const [name, { sum, count }] of Array.from(map.entries())) {
      result.set(name, sum / count);
    }
    return result;
  };

  const recentAvg = avgByCandidate(recentData as SentimentRow[]);
  const prevAvg = avgByCandidate(prevData as SentimentRow[]);

  const signals: TrendSignal[] = [];

  for (const [name, currentScore] of Array.from(recentAvg.entries())) {
    const prevScore = prevAvg.get(name);
    if (prevScore === undefined) continue;

    const change = currentScore - prevScore;
    if (Math.abs(change) < 0.3) continue;

    const direction = change > 0 ? "긍정" : "부정";
    signals.push({
      type: "sentiment_shift",
      severity: getSeverity(Math.abs(change), [0.7, 0.5, 0.3]),
      candidateName: name,
      description: `${name} 감성 ${direction} 전환 (${change > 0 ? "+" : ""}${change.toFixed(2)})`,
      evidence: [
        `이전 24h 평균: ${prevScore.toFixed(2)}`,
        `최근 24h 평균: ${currentScore.toFixed(2)}`,
        `변화량: ${change > 0 ? "+" : ""}${change.toFixed(2)}`,
      ],
      detectedAt: new Date().toISOString(),
    });
  }

  return signals;
}

/**
 * Rule 3: Emerging issue -- keywords in last 24h not seen in previous 7 days
 */
async function detectEmergingIssues(supabase: SupabaseClient): Promise<TrendSignal[]> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get keywords from last 24h
  const { data: recentArticles, error: recentError } = await supabase
    .from("analyzed_articles")
    .select("keywords, article_id")
    .gte("nlp_processed_at", since24h);

  if (recentError || !recentArticles || recentArticles.length === 0) return [];

  // Get keywords from previous 7 days
  const { data: olderArticles, error: olderError } = await supabase
    .from("analyzed_articles")
    .select("keywords")
    .gte("nlp_processed_at", since7d)
    .lt("nlp_processed_at", since24h);

  if (olderError) {
    logger.error("Failed to query older articles", { error: olderError.message });
    return [];
  }

  // Build keyword frequency maps
  const recentKeywords = new Map<string, number>();
  for (const row of recentArticles) {
    const kws = Array.isArray(row.keywords) ? (row.keywords as string[]) : [];
    for (const kw of kws) {
      recentKeywords.set(kw, (recentKeywords.get(kw) ?? 0) + 1);
    }
  }

  const olderKeywordSet = new Set<string>();
  for (const row of olderArticles ?? []) {
    const kws = Array.isArray(row.keywords) ? (row.keywords as string[]) : [];
    for (const kw of kws) {
      olderKeywordSet.add(kw);
    }
  }

  // Find new keywords that appear 3+ times in 24h but never in past 7 days
  const signals: TrendSignal[] = [];
  for (const [keyword, count] of Array.from(recentKeywords.entries())) {
    if (count >= 3 && !olderKeywordSet.has(keyword)) {
      signals.push({
        type: "issue_emerging",
        severity: getSeverity(count, [10, 7, 3]),
        description: `새로운 이슈 감지: "${keyword}" (최근 24시간 ${count}건)`,
        evidence: [
          `키워드: ${keyword}`,
          `24시간 내 등장 횟수: ${count}`,
          `이전 7일간 등장 없음`,
        ],
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Sort by frequency descending and limit
  return signals
    .sort((a, b) => {
      const countA = parseInt(a.evidence[1].match(/\d+/)?.[0] ?? "0");
      const countB = parseInt(b.evidence[1].match(/\d+/)?.[0] ?? "0");
      return countB - countA;
    })
    .slice(0, 10);
}

/**
 * Rule 4: Breaking news -- 5+ significant articles in 1-hour window
 */
async function detectBreakingNews(supabase: SupabaseClient): Promise<TrendSignal[]> {
  const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("analyzed_articles")
    .select("article_id, keywords, ai_summary, big_category, nlp_processed_at")
    .gte("nlp_processed_at", since6h)
    .eq("is_significant", true)
    .order("nlp_processed_at", { ascending: true });

  if (error || !data || data.length === 0) return [];

  // Group articles into 1-hour windows and check for topic clustering
  const signals: TrendSignal[] = [];
  const windowMs = 60 * 60 * 1000; // 1 hour

  // Sliding window approach
  for (let i = 0; i < data.length; i++) {
    const windowStart = new Date(data[i].nlp_processed_at).getTime();
    const windowEnd = windowStart + windowMs;

    const windowArticles = data.filter((a) => {
      const t = new Date(a.nlp_processed_at).getTime();
      return t >= windowStart && t <= windowEnd;
    });

    if (windowArticles.length >= 5) {
      // Find most common keyword in window to identify the topic
      const kwCounts = new Map<string, number>();
      for (const article of windowArticles) {
        const kws = Array.isArray(article.keywords) ? (article.keywords as string[]) : [];
        for (const kw of kws) {
          kwCounts.set(kw, (kwCounts.get(kw) ?? 0) + 1);
        }
      }

      let topKeyword = "미확인";
      let topCount = 0;
      for (const [kw, count] of Array.from(kwCounts.entries())) {
        if (count > topCount) {
          topKeyword = kw;
          topCount = count;
        }
      }

      // Avoid duplicate signals for overlapping windows
      const alreadyDetected = signals.some(
        (s) => s.type === "breaking_news" && s.description.includes(topKeyword),
      );
      if (alreadyDetected) continue;

      signals.push({
        type: "breaking_news",
        severity: getSeverity(windowArticles.length, [15, 10, 5]),
        description: `속보 감지: "${topKeyword}" 관련 ${windowArticles.length}건 (1시간 내)`,
        evidence: [
          `주요 키워드: ${topKeyword}`,
          `기사 수: ${windowArticles.length}건`,
          `시간대: ${new Date(windowStart).toISOString()} ~ ${new Date(windowEnd).toISOString()}`,
          `카테고리: ${windowArticles.map((a) => a.big_category).filter(Boolean).join(", ")}`,
        ],
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Trigger.dev Task
// ---------------------------------------------------------------------------

export const detectTrends = task({
  id: "detect-trends",
  retry: {
    maxAttempts: 1,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 120_000,
  },
  run: async (_payload: DetectTrendsPayload) => {
    logger.info("Starting trend detection");
    const supabase = getServiceClient();

    // Run all detectors in parallel
    const [pollShifts, sentimentShifts, emergingIssues, breakingNews] = await Promise.all([
      detectPollShifts(supabase),
      detectSentimentShifts(supabase),
      detectEmergingIssues(supabase),
      detectBreakingNews(supabase),
    ]);

    const allSignals: TrendSignal[] = [
      ...pollShifts,
      ...sentimentShifts,
      ...emergingIssues,
      ...breakingNews,
    ];

    logger.info("Trend detection complete", {
      pollShifts: pollShifts.length,
      sentimentShifts: sentimentShifts.length,
      emergingIssues: emergingIssues.length,
      breakingNews: breakingNews.length,
      total: allSignals.length,
    });

    // Store detected trends
    if (allSignals.length > 0) {
      const rows = allSignals.map((signal) => ({
        type: signal.type,
        severity: signal.severity,
        province_code: signal.provinceCode ?? null,
        candidate_name: signal.candidateName ?? null,
        description: signal.description,
        evidence: signal.evidence,
        detected_at: signal.detectedAt,
      }));

      const { error: insertError } = await supabase
        .from("detected_trends")
        .insert(rows);

      if (insertError) {
        logger.error("Failed to store detected trends", { error: insertError });
      }

      // Trigger notifications for critical/high severity signals
      const urgentSignals = allSignals.filter(
        (s) => s.severity === "critical" || s.severity === "high",
      );

      if (urgentSignals.length > 0) {
        logger.info("Urgent trend signals detected", {
          count: urgentSignals.length,
          signals: urgentSignals.map((s) => ({
            type: s.type,
            severity: s.severity,
            description: s.description,
          })),
        });

        // Store notification records for the dashboard to pick up
        const notifRows = urgentSignals.map((s) => ({
          type: "trend_alert",
          severity: s.severity,
          title: `[${s.severity.toUpperCase()}] ${s.type}`,
          message: s.description,
          metadata: {
            trend_type: s.type,
            province_code: s.provinceCode,
            candidate_name: s.candidateName,
            evidence: s.evidence,
          },
          is_read: false,
          created_at: new Date().toISOString(),
        }));

        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifRows);

        if (notifError) {
          logger.error("Failed to store notifications", { error: notifError });
        }
      }
    }

    return {
      signals: allSignals,
      counts: {
        pollShifts: pollShifts.length,
        sentimentShifts: sentimentShifts.length,
        emergingIssues: emergingIssues.length,
        breakingNews: breakingNews.length,
        total: allSignals.length,
      },
    };
  },
});
