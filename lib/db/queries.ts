/**
 * Common database query functions - 국무노션 (GukmuNotion)
 *
 * All queries use the typed Supabase client for compile-time safety.
 * Server-side queries use the service client to bypass RLS.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  LatestPoll,
  RecentSignificantNews,
  CandidateSentimentTrend,
  HotTopic,
  ProvincePollSummary,
  RawArticle,
} from "./database.types";

// ────────────────────────────────────────────────────────────
// Client factory
// ────────────────────────────────────────────────────────────

function getServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient<Database>(url, key);
}

function getBrowserClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient<Database>(url, key);
}

// ────────────────────────────────────────────────────────────
// Election / Poll queries
// ────────────────────────────────────────────────────────────

/**
 * Get the most recent poll results for each candidate in a province.
 * Uses the v_latest_polls view which deduplicates by (province, candidate).
 */
export async function getLatestPolls(
  provinceCode: string
): Promise<LatestPoll[]> {
  const client = getBrowserClient();
  const { data, error } = await client
    .from("v_latest_polls" as never)
    .select("*")
    .eq("province_code", provinceCode)
    .order("percentage", { ascending: false });

  if (error) {
    console.error("[getLatestPolls] Query failed:", error.message);
    return [];
  }
  return (data as unknown as LatestPoll[]) ?? [];
}

/**
 * Get province-level poll summary with trend data.
 * Returns all candidates ordered by avg_percentage descending.
 */
export async function getProvincePollSummary(
  provinceCode: string
): Promise<ProvincePollSummary[]> {
  const client = getBrowserClient();
  const { data, error } = await client
    .from("v_province_poll_summary" as never)
    .select("*")
    .eq("province_code", provinceCode);

  if (error) {
    console.error("[getProvincePollSummary] Query failed:", error.message);
    return [];
  }
  return (data as unknown as ProvincePollSummary[]) ?? [];
}

// ────────────────────────────────────────────────────────────
// News queries
// ────────────────────────────────────────────────────────────

/**
 * Get the most recent significant (AI-flagged) news articles.
 * Pulls from v_recent_significant_news view.
 */
export async function getRecentSignificantNews(
  limit: number = 20
): Promise<RecentSignificantNews[]> {
  const client = getBrowserClient();
  const { data, error } = await client
    .from("v_recent_significant_news" as never)
    .select("*")
    .limit(limit);

  if (error) {
    console.error("[getRecentSignificantNews] Query failed:", error.message);
    return [];
  }
  return (data as unknown as RecentSignificantNews[]) ?? [];
}

// ────────────────────────────────────────────────────────────
// Sentiment queries
// ────────────────────────────────────────────────────────────

/**
 * Get daily-aggregated sentiment trend for a specific candidate.
 * Returns the most recent `days` of data.
 */
export async function getCandidateSentimentTrend(
  candidateId: string,
  days: number = 30
): Promise<CandidateSentimentTrend[]> {
  const client = getBrowserClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const { data, error } = await client
    .from("v_candidate_sentiment_trend" as never)
    .select("*")
    .eq("candidate_id", candidateId)
    .gte("date", cutoff)
    .order("date", { ascending: true });

  if (error) {
    console.error("[getCandidateSentimentTrend] Query failed:", error.message);
    return [];
  }
  return (data as unknown as CandidateSentimentTrend[]) ?? [];
}

// ────────────────────────────────────────────────────────────
// Hot Topics queries
// ────────────────────────────────────────────────────────────

/**
 * Get top trending keywords across all analyzed articles.
 */
export async function getHotTopics(limit: number = 20): Promise<HotTopic[]> {
  const client = getBrowserClient();
  const { data, error } = await client
    .from("hot_topics")
    .select("*")
    .order("count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getHotTopics] Query failed:", error.message);
    return [];
  }
  return (data as unknown as HotTopic[]) ?? [];
}

// ────────────────────────────────────────────────────────────
// Agent / Pipeline queries (server-side, bypasses RLS)
// ────────────────────────────────────────────────────────────

/**
 * Get raw articles that have not been analyzed by AI yet.
 * Used by the analysis pipeline (Trigger.dev tasks).
 */
export async function getUnanalyzedArticles(
  limit: number = 50
): Promise<RawArticle[]> {
  const client = getServiceClient();
  const { data, error } = await client
    .from("raw_articles")
    .select("*")
    .eq("is_analyzed", false)
    .order("collected_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[getUnanalyzedArticles] Query failed:", error.message);
    return [];
  }
  return (data as unknown as RawArticle[]) ?? [];
}

/**
 * Given a list of known NESDC poll IDs, return the IDs that are NOT
 * yet in our raw_polls table. Useful for incremental crawling.
 */
export async function getNewNesdcIds(
  existingIds: number[]
): Promise<number[]> {
  if (existingIds.length === 0) return [];

  const client = getServiceClient();
  const { data, error } = await client
    .from("raw_polls")
    .select("nesdc_id")
    .in("nesdc_id", existingIds);

  if (error) {
    console.error("[getNewNesdcIds] Query failed:", error.message);
    return existingIds; // assume all new on error
  }

  const knownIds = new Set(
    (data as unknown as { nesdc_id: number }[]).map((r) => r.nesdc_id)
  );
  return existingIds.filter((id) => !knownIds.has(id));
}

// ────────────────────────────────────────────────────────────
// Batch insert helpers
// ────────────────────────────────────────────────────────────

/**
 * Upsert raw articles (deduplicates by source + source_id).
 * Returns the count of newly inserted rows.
 */
export async function upsertRawArticles(
  articles: Database["public"]["Tables"]["raw_articles"]["Insert"][]
): Promise<number> {
  if (articles.length === 0) return 0;

  const client = getServiceClient();
  const { data, error } = await client
    .from("raw_articles")
    .upsert(articles as never[], {
      onConflict: "source,source_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error("[upsertRawArticles] Upsert failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Mark a raw article as analyzed after AI processing completes.
 */
export async function markArticleAnalyzed(articleId: string): Promise<void> {
  const client = getServiceClient();
  const { error } = await client
    .from("raw_articles")
    .update({ is_analyzed: true } as never)
    .eq("id", articleId);

  if (error) {
    console.error("[markArticleAnalyzed] Update failed:", error.message);
  }
}
