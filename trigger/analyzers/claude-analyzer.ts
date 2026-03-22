/**
 * Claude Deep Analysis Task
 *
 * Trigger.dev task that performs deep analysis of news articles using
 * Claude claude-sonnet-4-6 for election relevance, sentiment, and trend detection.
 */
import { task, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateSentimentResult {
  name: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  context: string;
}

interface ClaudeAnalysisResult {
  is_significant: boolean;
  significance_reason: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  sentiment_score: number;
  candidate_sentiments: CandidateSentimentResult[];
  related_provinces: string[];
  related_issues: string[];
  trend_signal: "rising" | "falling" | "stable" | "breaking";
  trend_detail: string;
  related_agendas: string[];
}

interface ClaudeAnalyzerPayload {
  articleId: string;
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
// Context fetchers
// ---------------------------------------------------------------------------

async function fetchActiveCandidates(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("candidates")
    .select("name, party, province_code")
    .eq("is_active", true)
    .limit(200);

  if (error || !data || data.length === 0) {
    logger.warn("No active candidates found", { error: error?.message });
    return "후보자 정보 없음";
  }

  return data
    .map((c: { name: string; party: string; province_code: string }) => `${c.name} (${c.party}, ${c.province_code})`)
    .join(", ");
}

async function fetchRecentPollTrends(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("poll_trends")
    .select("candidate_name, party, province_code, percentage, change_amount, surveyed_at")
    .order("surveyed_at", { ascending: false })
    .limit(30);

  if (error || !data || data.length === 0) {
    return "최근 여론조사 데이터 없음";
  }

  return data
    .map(
      (p: {
        candidate_name: string;
        party: string;
        province_code: string;
        percentage: number;
        change_amount: number;
        surveyed_at: string;
      }) =>
        `${p.candidate_name}(${p.party}, ${p.province_code}): ${p.percentage}% (${p.change_amount >= 0 ? "+" : ""}${p.change_amount}) [${p.surveyed_at}]`,
    )
    .join("\n");
}

async function fetchActiveIssues(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("hot_topics")
    .select("keyword, count, trend, category")
    .order("count", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return "활성 이슈 없음";
  }

  return data
    .map((t: { keyword: string; count: number; trend: string }) => `${t.keyword} (${t.count}건, ${t.trend})`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(
  client: Anthropic,
  article: { title: string; body: string },
  nlp: { category: string; entities: string; keywords: string },
  contextData: { candidates: string; polls: string; issues: string },
): Promise<ClaudeAnalysisResult> {
  const systemPrompt = `당신은 한국 제9회 전국동시지방선거(2026.06.03) 분석 전문가입니다.
다음 뉴스 기사를 분석하여 정확한 JSON 형식으로만 응답하세요.

Context:
- 현재 후보자: ${contextData.candidates}
- 최근 여론조사 트렌드: ${contextData.polls}
- 활성 지역 이슈: ${contextData.issues}

Article:
${article.title}
${(article.body ?? "").slice(0, 4000)}

NLP Results:
- 분류: ${nlp.category}
- 개체명: ${nlp.entities}
- 키워드: ${nlp.keywords}

Respond with JSON only:
{
  "is_significant": boolean,
  "significance_reason": "string",
  "summary": "2-3문장 요약",
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": -1.0 to 1.0,
  "candidate_sentiments": [
    { "name": "후보명", "sentiment": "positive|negative|neutral", "score": -1.0 to 1.0, "context": "관련 문맥" }
  ],
  "related_provinces": ["seoul", "busan"],
  "related_issues": ["issue description"],
  "trend_signal": "rising|falling|stable|breaking",
  "trend_detail": "트렌드 설명",
  "related_agendas": ["agenda description if any"]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: systemPrompt,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";

  return parseClaudeResponse(rawText);
}

/**
 * Parse Claude's JSON response with fallback extraction.
 */
function parseClaudeResponse(raw: string): ClaudeAnalysisResult {
  // Try direct JSON parse first
  try {
    return JSON.parse(raw) as ClaudeAnalysisResult;
  } catch {
    // Fallback: extract JSON from markdown code block
  }

  // Try extracting from ```json ... ``` blocks
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim()) as ClaudeAnalysisResult;
    } catch {
      // continue to fallback
    }
  }

  // Try extracting first { ... } block
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as ClaudeAnalysisResult;
    } catch {
      // continue to fallback
    }
  }

  // Return a safe default if all parsing fails
  logger.error("Failed to parse Claude response", { raw: raw.slice(0, 500) });
  return {
    is_significant: false,
    significance_reason: "분석 실패: JSON 파싱 오류",
    summary: raw.slice(0, 200),
    sentiment: "neutral",
    sentiment_score: 0,
    candidate_sentiments: [],
    related_provinces: [],
    related_issues: [],
    trend_signal: "stable",
    trend_detail: "",
    related_agendas: [],
  };
}

// ---------------------------------------------------------------------------
// Trigger.dev Task
// ---------------------------------------------------------------------------

export const claudeDeepAnalysis = task({
  id: "claude-deep-analysis",
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: ClaudeAnalyzerPayload) => {
    const { articleId } = payload;
    logger.info("Starting Claude deep analysis", { articleId });

    const supabase = getServiceClient();
    const anthropic = getAnthropicClient();

    // 1. Fetch raw article
    const { data: article, error: articleError } = await supabase
      .from("raw_articles")
      .select("id, title, body, source_url, published_at")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      throw new Error(`Article ${articleId} not found: ${articleError?.message}`);
    }

    // 2. Fetch NLP results
    const { data: nlpData } = await supabase
      .from("analyzed_articles")
      .select("big_category, small_category, entities, keywords, summary")
      .eq("article_id", articleId)
      .single();

    const nlp = {
      category: nlpData?.big_category ?? "미분류",
      entities: JSON.stringify(nlpData?.entities ?? []),
      keywords: JSON.stringify(nlpData?.keywords ?? []),
    };

    // 3. Fetch current context (all in parallel)
    const [candidates, polls, issues] = await Promise.all([
      fetchActiveCandidates(supabase),
      fetchRecentPollTrends(supabase),
      fetchActiveIssues(supabase),
    ]);

    // 4. Call Claude
    const analysis = await callClaude(
      anthropic,
      { title: article.title, body: article.body ?? "" },
      nlp,
      { candidates, polls, issues },
    );

    // 5. Update analyzed_articles
    const { error: updateError } = await supabase
      .from("analyzed_articles")
      .update({
        is_significant: analysis.is_significant,
        significance_reason: analysis.significance_reason,
        ai_summary: analysis.summary,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        related_provinces: analysis.related_provinces,
        related_issues: analysis.related_issues,
        trend_signal: analysis.trend_signal,
        trend_detail: analysis.trend_detail,
        related_agendas: analysis.related_agendas,
        claude_analyzed_at: new Date().toISOString(),
      })
      .eq("article_id", articleId);

    if (updateError) {
      logger.error("Failed to update analyzed_articles", { articleId, error: updateError });
      throw updateError;
    }

    // 6. Insert candidate sentiments
    if (analysis.candidate_sentiments.length > 0) {
      const sentimentRows = analysis.candidate_sentiments.map((cs) => ({
        article_id: articleId,
        candidate_name: cs.name,
        sentiment: cs.sentiment,
        sentiment_score: cs.score,
        context: cs.context,
        analyzed_at: new Date().toISOString(),
      }));

      const { error: sentimentError } = await supabase
        .from("candidate_sentiments")
        .upsert(sentimentRows, { onConflict: "article_id,candidate_name" });

      if (sentimentError) {
        logger.error("Failed to insert candidate_sentiments", {
          articleId,
          error: sentimentError,
        });
        // Non-fatal: don't throw
      }
    }

    logger.info("Claude deep analysis complete", {
      articleId,
      isSignificant: analysis.is_significant,
      sentiment: analysis.sentiment,
      trendSignal: analysis.trend_signal,
    });

    return {
      articleId,
      ...analysis,
    };
  },
});
