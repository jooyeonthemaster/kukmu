/**
 * BigKinds Lab NLP Batch Processing Task
 *
 * Trigger.dev task that calls BigKinds Lab NLP APIs for article analysis.
 * Processes articles in batches of 10 with concurrency control.
 */
import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculateRelevanceScore } from "./relevance-scorer";
import { ELECTION_KEYWORDS } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BigKindsCls {
  big_cls: string;
  small_cls: string;
  region_cls: string;
}

interface BigKindsNerEntity {
  word: string;
  label: string;
  desc: string;
}

interface NlpResult {
  classification: BigKindsCls;
  entities: BigKindsNerEntity[];
  keywords: string[];
  summary: string[];
}

interface ArticleNlpResult {
  articleId: string;
  relevanceScore: number;
  category: string;
  entities: BigKindsNerEntity[];
  keywords: string[];
}

interface BatchNlpPayload {
  articleIds: string[];
}

// ---------------------------------------------------------------------------
// Supabase service client
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
// BigKinds API helpers
// ---------------------------------------------------------------------------

const BIGKINDS_CLS_URL = "http://api2.bigkindslab.or.kr:5002/get_cls";
const BIGKINDS_NER_URL = "http://api2.bigkindslab.or.kr:5002/get_ner";
const BIGKINDS_KEYWORD_URL = "http://api.bigkindslab.or.kr:5002/get_keyword";
const BIGKINDS_SUMMARY_URL = "http://api.bigkindslab.or.kr:5002/get_summary";

async function callBigKindsApi<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`BigKinds API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function runNlpPipeline(text: string): Promise<NlpResult> {
  // Truncate to avoid API limits (BigKinds typically handles up to ~5000 chars)
  const truncated = text.slice(0, 5000);

  // Split into sentences for summary API
  const sentences = truncated
    .split(/[.!?]\s+/)
    .filter((s) => s.trim().length > 10)
    .slice(0, 30);

  const [classification, entities, keywordResult, summaryResult] = await Promise.all([
    callBigKindsApi<BigKindsCls>(BIGKINDS_CLS_URL, { text: truncated }),
    callBigKindsApi<BigKindsNerEntity[]>(BIGKINDS_NER_URL, { text: truncated }),
    callBigKindsApi<{ keywords?: string[] }>(BIGKINDS_KEYWORD_URL, { text: truncated }),
    callBigKindsApi<{ summary?: string[] }>(BIGKINDS_SUMMARY_URL, { sentences }),
  ]);

  return {
    classification,
    entities: Array.isArray(entities) ? entities : [],
    keywords: Array.isArray(keywordResult?.keywords) ? keywordResult.keywords : [],
    summary: Array.isArray(summaryResult?.summary) ? summaryResult.summary : [],
  };
}

// ---------------------------------------------------------------------------
// Single article processor
// ---------------------------------------------------------------------------

async function processArticle(
  articleId: string,
  supabase: SupabaseClient,
): Promise<ArticleNlpResult> {
  // 1. Fetch article text
  const { data: article, error } = await supabase
    .from("raw_articles")
    .select("id, title, body, source_url")
    .eq("id", articleId)
    .single();

  if (error || !article) {
    throw new Error(`Article ${articleId} not found: ${error?.message}`);
  }

  const fullText = `${article.title}\n\n${article.body ?? ""}`;

  // 2. Run NLP pipeline
  const nlp = await runNlpPipeline(fullText);

  // 3. Calculate relevance score
  const relevanceScore = calculateRelevanceScore(
    {
      title: article.title,
      body: article.body ?? undefined,
      entities: nlp.entities,
      keywords: nlp.keywords,
      big_category: nlp.classification.big_cls,
    },
    {
      // These will be enriched later by Claude analyzer; use election keywords for now
      candidateNames: [],
      provinceNames: [],
      electionKeywords: ELECTION_KEYWORDS,
    },
  );

  // 4. Store NLP results in analyzed_articles
  const { error: upsertError } = await supabase.from("analyzed_articles").upsert(
    {
      article_id: articleId,
      big_category: nlp.classification.big_cls,
      small_category: nlp.classification.small_cls,
      region_category: nlp.classification.region_cls,
      entities: nlp.entities,
      keywords: nlp.keywords,
      summary: nlp.summary.join(" "),
      relevance_score: relevanceScore,
      nlp_processed_at: new Date().toISOString(),
    },
    { onConflict: "article_id" },
  );

  if (upsertError) {
    logger.error("Failed to upsert analyzed_articles", { articleId, error: upsertError });
    throw upsertError;
  }

  return {
    articleId,
    relevanceScore,
    category: nlp.classification.big_cls,
    entities: nlp.entities,
    keywords: nlp.keywords,
  };
}

// ---------------------------------------------------------------------------
// Batch processing with concurrency control
// ---------------------------------------------------------------------------

async function processBatch(
  batch: string[],
  supabase: SupabaseClient,
): Promise<ArticleNlpResult[]> {
  const results = await Promise.allSettled(
    batch.map((id) => processArticle(id, supabase)),
  );

  const successful: ArticleNlpResult[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      logger.error("Article processing failed", { error: String(result.reason) });
    }
  }
  return successful;
}

// ---------------------------------------------------------------------------
// Trigger.dev Task
// ---------------------------------------------------------------------------

export const batchNlpAnalysis = task({
  id: "batch-nlp-analysis",
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: BatchNlpPayload) => {
    const { articleIds } = payload;

    if (!articleIds.length) {
      logger.warn("No article IDs provided");
      return { results: [], totalProcessed: 0, totalFailed: 0 };
    }

    logger.info(`Starting batch NLP analysis for ${articleIds.length} articles`);

    const supabase = getServiceClient();
    const BATCH_SIZE = 10;
    const allResults: ArticleNlpResult[] = [];

    // Process in batches of 10
    for (let i = 0; i < articleIds.length; i += BATCH_SIZE) {
      const batch = articleIds.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`, {
        batchSize: batch.length,
        progress: `${i + batch.length}/${articleIds.length}`,
      });

      const batchResults = await processBatch(batch, supabase);
      allResults.push(...batchResults);

      // Brief pause between batches to avoid rate limiting
      if (i + BATCH_SIZE < articleIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const totalFailed = articleIds.length - allResults.length;
    logger.info("Batch NLP analysis complete", {
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
