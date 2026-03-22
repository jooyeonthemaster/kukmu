/**
 * Batch Sentiment Analysis Task
 *
 * Trigger.dev task for lightweight sentiment analysis of community / SNS posts
 * using Claude Haiku for cost efficiency.
 */
import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SentimentResult {
  postId: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  score: number;
  candidateMentions: { name: string; sentiment: string }[];
}

interface BatchSentimentPayload {
  postIds: string[];
}

interface PostRow {
  id: string;
  title: string | null;
  content: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key);
}

function getAnthropicClient(): Anthropic {
  return new Anthropic();
}

// ---------------------------------------------------------------------------
// Prompt template (concise for Haiku cost efficiency)
// ---------------------------------------------------------------------------

const SENTIMENT_SYSTEM_PROMPT = `한국 2026 지방선거 관련 커뮤니티/SNS 게시글의 감성을 분석합니다.
JSON 배열로만 응답하세요. 각 항목:
{
  "id": "post id",
  "sentiment": "positive|negative|neutral|mixed",
  "score": -1.0 ~ 1.0,
  "candidates": [{"name":"후보명","sentiment":"positive|negative|neutral"}]
}
후보자 언급이 없으면 candidates를 빈 배열로 두세요.`;

// ---------------------------------------------------------------------------
// Claude Haiku batch call
// ---------------------------------------------------------------------------

async function analyzeSentimentBatch(
  client: Anthropic,
  posts: PostRow[],
): Promise<SentimentResult[]> {
  // Format posts for the prompt
  const postsText = posts
    .map((p) => {
      const title = p.title ? `[${p.title}] ` : "";
      const content = (p.content ?? "").slice(0, 500);
      return `ID:${p.id} | ${title}${content}`;
    })
    .join("\n---\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SENTIMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 ${posts.length}개 게시글의 감성을 분석하세요:\n\n${postsText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "[]";

  return parseSentimentResponse(rawText, posts);
}

function parseSentimentResponse(raw: string, posts: PostRow[]): SentimentResult[] {
  let parsed: unknown[];

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try extracting from code block
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        parsed = JSON.parse(match[1].trim());
      } catch {
        parsed = [];
      }
    } else {
      const braceMatch = raw.match(/\[[\s\S]*\]/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch {
          parsed = [];
        }
      } else {
        parsed = [];
      }
    }
  }

  if (!Array.isArray(parsed)) {
    logger.warn("Sentiment response was not an array", { raw: raw.slice(0, 300) });
    parsed = [];
  }

  // Map parsed results back to post IDs with validation
  const postIdSet = new Set(posts.map((p) => p.id));

  return (parsed as Record<string, unknown>[])
    .filter((item) => typeof item.id === "string" && postIdSet.has(item.id as string))
    .map((item) => ({
      postId: item.id as string,
      sentiment: validateSentiment(item.sentiment),
      score: typeof item.score === "number" ? clamp(item.score, -1, 1) : 0,
      candidateMentions: Array.isArray(item.candidates)
        ? (item.candidates as { name: string; sentiment: string }[]).map((c) => ({
            name: c.name ?? "",
            sentiment: c.sentiment ?? "neutral",
          }))
        : [],
    }));
}

function validateSentiment(
  val: unknown,
): "positive" | "negative" | "neutral" | "mixed" {
  const valid = ["positive", "negative", "neutral", "mixed"];
  if (typeof val === "string" && valid.includes(val)) {
    return val as "positive" | "negative" | "neutral" | "mixed";
  }
  return "neutral";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Trigger.dev Task
// ---------------------------------------------------------------------------

export const batchSentimentAnalysis = task({
  id: "batch-sentiment-analysis",
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: BatchSentimentPayload) => {
    const { postIds } = payload;

    if (!postIds.length) {
      logger.warn("No post IDs provided");
      return { results: [], totalProcessed: 0, totalFailed: 0 };
    }

    logger.info(`Starting batch sentiment analysis for ${postIds.length} posts`);

    const supabase = getServiceClient();
    const anthropic = getAnthropicClient();

    // 1. Fetch posts from raw_community_posts
    const { data: posts, error } = await supabase
      .from("raw_community_posts")
      .select("id, title, content, source")
      .in("id", postIds);

    if (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    if (!posts || posts.length === 0) {
      logger.warn("No posts found for given IDs");
      return { results: [], totalProcessed: 0, totalFailed: 0 };
    }

    // 2. Process in batches of 10 (Haiku can handle multiple posts per call)
    const BATCH_SIZE = 10;
    const allResults: SentimentResult[] = [];

    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE) as PostRow[];

      logger.info(`Processing sentiment batch ${Math.floor(i / BATCH_SIZE) + 1}`, {
        batchSize: batch.length,
      });

      try {
        const batchResults = await analyzeSentimentBatch(anthropic, batch);
        allResults.push(...batchResults);
      } catch (err) {
        logger.error("Sentiment batch failed", {
          error: String(err),
          postIds: batch.map((p) => p.id),
        });
      }

      // Brief pause between batches
      if (i + BATCH_SIZE < posts.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // 3. Store results
    if (allResults.length > 0) {
      const rows = allResults.map((r) => ({
        post_id: r.postId,
        sentiment: r.sentiment,
        sentiment_score: r.score,
        candidate_mentions: r.candidateMentions,
        analyzed_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("community_sentiments")
        .upsert(rows, { onConflict: "post_id" });

      if (upsertError) {
        logger.error("Failed to store sentiment results", { error: upsertError });
      }
    }

    const totalFailed = postIds.length - allResults.length;
    logger.info("Batch sentiment analysis complete", {
      totalProcessed: allResults.length,
      totalFailed,
    });

    return {
      results: allResults,
      totalProcessed: allResults.length,
      totalFailed,
    };
  },
});
