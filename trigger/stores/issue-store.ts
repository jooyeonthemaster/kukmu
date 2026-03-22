import { task, logger } from "@trigger.dev/sdk/v3";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueData {
  keyword: string;
  category: string;
  province_codes: string[];
  related_article_ids: string[];
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  importance_score: number;
  first_seen_at: string;
  related_ministry: string | null;
}

export interface UpsertIssuesResult {
  newIssueCount: number;
  updatedIssueCount: number;
}

// ---------------------------------------------------------------------------
// Task: upsert-issues
// ---------------------------------------------------------------------------

export const upsertIssues = task({
  id: "upsert-issues",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    issues: IssueData[];
  }): Promise<UpsertIssuesResult> => {
    const { issues } = payload;

    if (issues.length === 0) {
      logger.info("No issues to upsert");
      return { newIssueCount: 0, updatedIssueCount: 0 };
    }

    logger.info(`Upserting ${issues.length} issues`);

    // Fetch existing hot_topics by keyword
    const keywords = issues.map((i) => i.keyword);
    const { data: existing, error: fetchError } = await supabase
      .from("hot_topics")
      .select("id, keyword, count")
      .in("keyword", keywords);

    if (fetchError) {
      logger.error("Failed to fetch existing issues", {
        error: fetchError.message,
      });
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    const existingMap = new Map(
      (existing ?? []).map((e) => [e.keyword, e]),
    );

    let newIssueCount = 0;
    let updatedIssueCount = 0;

    for (const issue of issues) {
      try {
        const existingIssue = existingMap.get(issue.keyword);

        if (existingIssue) {
          // Update: increment count, update trend
          const newCount = (existingIssue.count ?? 0) + issue.related_article_ids.length;
          const trend = determineTrend(existingIssue.count ?? 0, newCount);

          const { error: updateError } = await supabase
            .from("hot_topics")
            .update({
              count: newCount,
              trend,                                // uses DB-valid enum
              category: issue.category,
              related_ministry: issue.related_ministry,
              last_seen: new Date().toISOString(),  // updated_at -> last_seen
            })
            .eq("id", existingIssue.id);

          if (updateError) {
            logger.error(`Failed to update issue ${issue.keyword}`, {
              error: updateError.message,
            });
            continue;
          }

          updatedIssueCount++;
        } else {
          // Insert new hot_topic (let DB auto-generate UUID)
          const { error: insertError } = await supabase
            .from("hot_topics")
            .insert({
              // id: auto-generated UUID (not custom string)
              keyword: issue.keyword,
              count: Math.max(issue.related_article_ids.length, 1),
              trend: "new" as const,              // DB enum: up/down/stable/new
              category: issue.category,
              related_ministry: issue.related_ministry,
              first_seen: issue.first_seen_at,
              last_seen: new Date().toISOString(),
            });

          if (insertError) {
            logger.error(`Failed to insert issue ${issue.keyword}`, {
              error: insertError.message,
            });
            continue;
          }

          newIssueCount++;
        }

        // Note: issue_articles junction table was removed from schema.
        // related_article_ids are tracked by count only.
      } catch (err) {
        logger.error(`Unexpected error upserting issue ${issue.keyword}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Issue upsert complete", { newIssueCount, updatedIssueCount });

    return { newIssueCount, updatedIssueCount };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine trend using DB-valid enum values: 'up' | 'down' | 'stable'
 */
function determineTrend(
  oldCount: number,
  newCount: number,
): "up" | "down" | "stable" {
  if (oldCount === 0) return "up";
  const changeRatio = (newCount - oldCount) / oldCount;
  if (changeRatio > 0.2) return "up";       // rising -> up
  if (changeRatio < -0.2) return "down";     // falling -> down
  return "stable";                            // steady -> stable
}
