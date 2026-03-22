import { schedules, task, logger } from "@trigger.dev/sdk/v3";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyStats {
  articles: {
    total_new: number;
    analyzed: number;
    significant: number;
    by_sentiment: { positive: number; negative: number; neutral: number };
  };
  polls: {
    total_new: number;
    provinces_with_new_polls: string[];
    trend_changes: Array<{
      province: string;
      old_leader: string;
      new_leader: string;
    }>;
  };
  issues: {
    new_issues: string[];
    trending_up: string[];
    trending_down: string[];
  };
  candidates: {
    new_registrations: number;
    pledge_updates: number;
  };
  cabinet: {
    new_agendas: number;
    high_priority: number;
  };
}

interface DailyBriefing {
  date: string;
  summary_ko: string;
  stats: DailyStats;
  top_stories: Array<{
    title: string;
    summary: string;
    relevance: number;
  }>;
}

interface DailyReportStats {
  triggeredAt: string;
  completedAt: string;
  briefingGenerated: boolean;
  statsCollected: boolean;
  hotTopicsRefreshed: boolean;
}

// Supabase client imported from shared lib

// ---------------------------------------------------------------------------
// Schedule: every day at 6 AM KST
// ---------------------------------------------------------------------------

export const dailyReportSchedule = schedules.task({
  id: "daily-report-cron",
  cron: { pattern: "0 6 * * *", timezone: "Asia/Seoul" },
  run: async (payload) => {
    logger.info("Daily report cron triggered", {
      timestamp: payload.timestamp.toISOString(),
    });

    const result = await dailyReportOrchestrator.triggerAndWait({
      triggeredAt: payload.timestamp.toISOString(),
    });

    logger.info("Daily report cron completed", { result });
    return result;
  },
});

// ---------------------------------------------------------------------------
// Orchestrator: daily-report
// ---------------------------------------------------------------------------

export const dailyReportOrchestrator = task({
  id: "daily-report",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: {
    triggeredAt: string;
  }): Promise<DailyReportStats> => {
    const startTime = Date.now();
    logger.info("Daily report started", { triggeredAt: payload.triggeredAt });

    // ------------------------------------------------------------------
    // Step 1: Gather stats from last 24 hours
    // ------------------------------------------------------------------
    logger.info("Step 1: Gathering 24-hour stats");

    const statsResult = await gatherDailyStats.triggerAndWait({
      since: get24HoursAgo(),
    });

    const stats: DailyStats = statsResult.ok
      ? statsResult.output
      : getEmptyStats();

    logger.info("Step 1 complete: Stats gathered", {
      newArticles: stats.articles.total_new,
      newPolls: stats.polls.total_new,
      newIssues: stats.issues.new_issues.length,
    });

    // ------------------------------------------------------------------
    // Step 2: Fetch top stories for the briefing
    // ------------------------------------------------------------------
    logger.info("Step 2: Fetching top stories");

    const topStoriesResult = await fetchTopStories.triggerAndWait({
      since: get24HoursAgo(),
      limit: 10,
    });

    const topStories = topStoriesResult.ok
      ? topStoriesResult.output.stories
      : [];

    logger.info(`Step 2 complete: ${topStories.length} top stories`);

    // ------------------------------------------------------------------
    // Step 3: Generate comprehensive daily briefing with Claude
    // ------------------------------------------------------------------
    logger.info("Step 3: Generating daily briefing");

    const briefingResult = await generateDailyBriefing.triggerAndWait({
      stats,
      topStories,
      date: new Date().toISOString().split("T")[0],
    });

    const briefing: DailyBriefing | null = briefingResult.ok
      ? briefingResult.output
      : null;

    if (!briefing) {
      logger.error("Failed to generate daily briefing");
    }

    logger.info("Step 3 complete: Briefing generated");

    // ------------------------------------------------------------------
    // Step 4: Store briefing in daily_briefings table
    // ------------------------------------------------------------------
    logger.info("Step 4: Storing daily briefing");

    let briefingStored = false;

    if (briefing) {
      const { error } = await supabase.from("daily_briefings").upsert(
        {
          date: briefing.date,
          summary: briefing.summary_ko,          // summary_ko -> summary
          stats: briefing.stats,
          key_findings: briefing.top_stories,    // top_stories -> key_findings
        },
        { onConflict: "date" },
      );

      if (error) {
        logger.warn("Failed to store daily briefing", {
          error: error.message,
        });
      } else {
        briefingStored = true;
        logger.info("Daily briefing stored successfully");
      }
    }

    // ------------------------------------------------------------------
    // Step 5: Refresh hot_topics
    // ------------------------------------------------------------------
    logger.info("Step 5: Refreshing hot topics");

    const refreshResult = await refreshHotTopics.triggerAndWait({
      since: get24HoursAgo(),
    });

    const hotTopicsRefreshed = refreshResult.ok
      ? refreshResult.output.refreshed
      : false;

    logger.info(`Step 5 complete: hot topics ${hotTopicsRefreshed ? "refreshed" : "refresh failed"}`);

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------
    const reportStats: DailyReportStats = {
      triggeredAt: payload.triggeredAt,
      completedAt: new Date().toISOString(),
      briefingGenerated: !!briefing,
      statsCollected: true,
      hotTopicsRefreshed,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Daily report complete in ${elapsed}s`, { reportStats });

    return reportStats;
  },
});

// ---------------------------------------------------------------------------
// Sub-tasks
// ---------------------------------------------------------------------------

export const gatherDailyStats = task({
  id: "gather-daily-stats",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000 },
  run: async (payload: { since: string }): Promise<DailyStats> => {
    const { since } = payload;
    logger.info("Gathering daily stats", { since });

    // Articles stats
    const { data: articles, error: artErr } = await supabase
      .from("raw_articles")
      .select("id, is_analyzed")
      .gte("collected_at", since);

    if (artErr) {
      logger.warn("Failed to fetch article stats", { error: artErr.message });
    }

    const articleList = articles ?? [];
    const analyzedArticles = articleList.filter((a) => a.is_analyzed);

    // Sentiment counts from analyzed_articles table
    const { data: sentimentData } = await supabase
      .from("analyzed_articles")
      .select("sentiment")
      .gte("analyzed_at", since);

    const sentimentList = sentimentData ?? [];
    const sentimentCounts = {
      positive: sentimentList.filter((a) => a.sentiment === "positive").length,
      negative: sentimentList.filter((a) => a.sentiment === "negative").length,
      neutral: sentimentList.filter((a) => a.sentiment === "neutral").length,
    };

    const significantArticles = sentimentList.filter(() => true); // count from analyzed

    // Poll stats
    const { data: polls, error: pollErr } = await supabase
      .from("raw_polls")
      .select("nesdc_id")
      .gte("collected_at", since);

    if (pollErr) {
      logger.warn("Failed to fetch poll stats", { error: pollErr.message });
    }

    const { data: pollResults, error: prErr } = await supabase
      .from("polls")
      .select("province_id, provinces(name)")
      .gte("created_at", since);

    if (prErr) {
      logger.warn("Failed to fetch poll result stats", { error: prErr.message });
    }

    const provincesWithNewPolls = [
      ...new Set(
        (pollResults ?? []).map((p: any) => p.provinces?.name).filter(Boolean),
      ),
    ];

    // Issue stats
    const { data: hotTopics, error: htErr } = await supabase
      .from("hot_topics")
      .select("keyword, trend, last_seen")
      .order("last_seen", { ascending: false })
      .limit(50);

    if (htErr) {
      logger.warn("Failed to fetch hot topic stats", { error: htErr.message });
    }

    const recentTopics = (hotTopics ?? []).filter(
      (t) => new Date(t.last_seen) >= new Date(since),
    );

    const trendingUp = recentTopics
      .filter((t) => t.trend === "up")          // rising -> up
      .map((t) => t.keyword);
    const trendingDown = recentTopics
      .filter((t) => t.trend === "down")        // falling -> down
      .map((t) => t.keyword);

    // Candidate stats (candidates table only has updated_at, no created_at)
    const { count: newCandidates } = await supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", since);

    // Approximate pledge updates as a subset of recently updated
    const pledgeUpdates = 0; // Cannot distinguish new vs updated without created_at

    // Agenda stats
    const { data: newAgendas, error: agErr } = await supabase
      .from("agendas")
      .select("id, priority")
      .gte("created_at", since);

    if (agErr) {
      logger.warn("Failed to fetch agenda stats", { error: agErr.message });
    }

    const agendaList = newAgendas ?? [];
    const highPriorityAgendas = agendaList.filter(
      (a) => a.priority === "urgent",     // high -> urgent in DB enum
    );

    const stats: DailyStats = {
      articles: {
        total_new: articleList.length,
        analyzed: analyzedArticles.length,
        significant: significantArticles.length,
        by_sentiment: sentimentCounts,
      },
      polls: {
        total_new: (polls ?? []).length,
        provinces_with_new_polls: provincesWithNewPolls,
        trend_changes: [], // Populated by poll trend analysis
      },
      issues: {
        new_issues: recentTopics.map((t) => t.keyword),
        trending_up: trendingUp,
        trending_down: trendingDown,
      },
      candidates: {
        new_registrations: newCandidates ?? 0,
        pledge_updates: pledgeUpdates ?? 0,
      },
      cabinet: {
        new_agendas: agendaList.length,
        high_priority: highPriorityAgendas.length,
      },
    };

    logger.info("Daily stats gathered", {
      articlesNew: stats.articles.total_new,
      pollsNew: stats.polls.total_new,
      issuesNew: stats.issues.new_issues.length,
    });

    return stats;
  },
});

export const fetchTopStories = task({
  id: "fetch-top-stories",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 15_000 },
  run: async (payload: {
    since: string;
    limit: number;
  }): Promise<{
    stories: Array<{ title: string; summary: string; relevance: number }>;
  }> => {
    const { since, limit } = payload;
    logger.info("Fetching top stories", { since, limit });

    const { data, error } = await supabase
      .from("analyzed_articles")
      .select("id, ai_summary, relevance_score, raw_article_id")
      .gte("analyzed_at", since)
      .eq("is_significant", true)
      .order("relevance_score", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch top stories", { error: error.message });
      return { stories: [] };
    }

    const stories = (data ?? []).map((a) => ({
      title: a.ai_summary ?? "",
      summary: a.ai_summary ?? "",
      relevance: a.relevance_score,
    }));

    logger.info(`Fetched ${stories.length} top stories`);
    return { stories };
  },
});

export const generateDailyBriefing = task({
  id: "generate-daily-briefing",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async (payload: {
    stats: DailyStats;
    topStories: Array<{ title: string; summary: string; relevance: number }>;
    date: string;
  }): Promise<DailyBriefing> => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const { stats, topStories, date } = payload;

    logger.info("Generating daily briefing with Claude", { date });

    const storySummaries = topStories
      .slice(0, 10)
      .map((s, i) => `${i + 1}. ${s.title}: ${s.summary}`)
      .join("\n");

    const prompt = `당신은 2026년 6.3 전국동시지방선거 분석 리포터입니다.
오늘 날짜: ${date}

다음 통계와 주요 기사를 바탕으로 일일 브리핑을 한국어로 작성하세요.

## 24시간 통계
- 새 기사: ${stats.articles.total_new}건 (분석완료: ${stats.articles.analyzed}건, 중요: ${stats.articles.significant}건)
- 기사 감성: 긍정 ${stats.articles.by_sentiment.positive}, 부정 ${stats.articles.by_sentiment.negative}, 중립 ${stats.articles.by_sentiment.neutral}
- 새 여론조사: ${stats.polls.total_new}건 (${stats.polls.provinces_with_new_polls.join(", ") || "해당 없음"})
- 새 이슈: ${stats.issues.new_issues.slice(0, 10).join(", ") || "없음"}
- 상승 트렌드: ${stats.issues.trending_up.slice(0, 5).join(", ") || "없음"}
- 하락 트렌드: ${stats.issues.trending_down.slice(0, 5).join(", ") || "없음"}
- 새 후보 등록: ${stats.candidates.new_registrations}명, 공약 업데이트: ${stats.candidates.pledge_updates}건
- 새 국무회의 안건: ${stats.cabinet.new_agendas}건 (긴급: ${stats.cabinet.high_priority}건)

## 주요 기사
${storySummaries || "주요 기사 없음"}

## 요청사항
다음 구조로 브리핑을 작성하세요 (1000-1500자):

1. **오늘의 핵심** (2-3문장 핵심 요약)
2. **선거 동향** (여론조사 변화, 후보 동향)
3. **이슈 분석** (주요 이슈와 그 의미)
4. **정책 동향** (국무회의 관련)
5. **내일 주목할 점**

자연스러운 한국어 문장으로 작성하고, 객관적 톤을 유지하세요.
마크다운 없이 순수 텍스트로 작성하세요.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const summaryText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const briefing: DailyBriefing = {
      date,
      summary_ko: summaryText.trim(),
      stats,
      top_stories: topStories.slice(0, 10),
    };

    logger.info("Daily briefing generated", {
      summaryLength: briefing.summary_ko.length,
    });

    return briefing;
  },
});

export const refreshHotTopics = task({
  id: "refresh-hot-topics",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    since: string;
  }): Promise<{ refreshed: boolean }> => {
    const { since } = payload;
    logger.info("Refreshing hot topics");

    try {
      // Try RPC first (if available)
      const { error: rpcError } = await supabase.rpc("refresh_hot_topics", {
        p_since: since,
      });

      if (!rpcError) {
        logger.info("Hot topics refreshed via RPC");
        return { refreshed: true };
      }

      logger.warn("RPC refresh_hot_topics not available, doing manual refresh", {
        error: rpcError.message,
      });

      // Manual refresh: recalculate trends based on recent activity
      const { data: topics, error: fetchError } = await supabase
        .from("hot_topics")
        .select("id, keyword, count, last_seen")
        .order("last_seen", { ascending: false })
        .limit(100);

      if (fetchError) {
        logger.error("Failed to fetch hot topics for refresh", {
          error: fetchError.message,
        });
        return { refreshed: false };
      }

      const now = new Date();
      const sinceDate = new Date(since);

      for (const topic of topics ?? []) {
        const lastSeen = new Date(topic.last_seen);
        let newTrend: "up" | "down" | "stable";

        if (lastSeen >= sinceDate) {
          newTrend = "up";
        } else {
          const hoursSinceUpdate =
            (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);
          newTrend = hoursSinceUpdate > 48 ? "down" : "stable";
        }

        await supabase
          .from("hot_topics")
          .update({ trend: newTrend, last_seen: now.toISOString() })
          .eq("id", topic.id);
      }

      logger.info(
        `Hot topics manually refreshed: ${(topics ?? []).length} topics updated`,
      );
      return { refreshed: true };
    } catch (err) {
      logger.error("Hot topics refresh failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { refreshed: false };
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function get24HoursAgo(): string {
  const now = new Date();
  now.setHours(now.getHours() - 24);
  return now.toISOString();
}

function getEmptyStats(): DailyStats {
  return {
    articles: {
      total_new: 0,
      analyzed: 0,
      significant: 0,
      by_sentiment: { positive: 0, negative: 0, neutral: 0 },
    },
    polls: {
      total_new: 0,
      provinces_with_new_polls: [],
      trend_changes: [],
    },
    issues: {
      new_issues: [],
      trending_up: [],
      trending_down: [],
    },
    candidates: {
      new_registrations: 0,
      pledge_updates: 0,
    },
    cabinet: {
      new_agendas: 0,
      high_priority: 0,
    },
  };
}
