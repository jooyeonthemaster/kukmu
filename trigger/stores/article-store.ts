import { task, logger } from "@trigger.dev/sdk/v3";
import { supabase, resolveProvinceId, resolveCandidateId } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawArticle {
  source: string;
  source_id: string;
  title: string;
  url: string;
  content: string | null;       // mapped to DB column "body"
  published_at: string | null;
  author: string | null;
  image_url: string | null;     // not stored in raw_articles (no column)
  crawled_at: string;           // mapped to DB column "collected_at"
  metadata: Record<string, unknown>; // not stored (no column)
}

export interface AnalysisResult {
  article_id: string; // raw_articles.id
  summary: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  relevance_score: number;
  key_entities: Array<{ name: string; type: string }>;
  key_topics: string[];
  province_codes: string[];
  candidate_sentiments: Array<{
    candidate_name: string;
    party: string;
    province_code: string;
    sentiment: "positive" | "negative" | "neutral";
    sentiment_score: number;
    context: string;
  }>;
  election_relevance: string | null;
}

export interface StoreRawArticlesResult {
  newArticleIds: string[];
  duplicateCount: number;
}

export interface StoreAnalysisResultsResult {
  storedCount: number;
}

// ---------------------------------------------------------------------------
// Task: store-raw-articles
// ---------------------------------------------------------------------------

export const storeRawArticles = task({
  id: "store-raw-articles",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    articles: RawArticle[];
  }): Promise<StoreRawArticlesResult> => {
    const { articles } = payload;

    if (articles.length === 0) {
      logger.info("No articles to store");
      return { newArticleIds: [], duplicateCount: 0 };
    }

    logger.info(`Storing ${articles.length} raw articles`);

    // Check existing by URL to detect duplicates
    const { data: existing, error: fetchError } = await supabase
      .from("raw_articles")
      .select("id, source, url")
      .in("url", articles.map((a) => a.url));

    if (fetchError) {
      logger.error("Failed to check existing articles", { error: fetchError.message });
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    const existingUrls = new Set((existing ?? []).map((e) => e.url));
    const newArticles = articles.filter((a) => !existingUrls.has(a.url));
    const duplicateCount = articles.length - newArticles.length;

    if (newArticles.length === 0) {
      logger.info(`All ${duplicateCount} articles are duplicates, skipping`);
      return { newArticleIds: [], duplicateCount };
    }

    // Batch upsert in chunks of 100
    const BATCH_SIZE = 100;
    const allNewIds: string[] = [];

    for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
      const batch = newArticles.slice(i, i + BATCH_SIZE);

      const rows = batch.map((article) => ({
        source: article.source,
        source_id: article.source_id,
        title: article.title,
        url: article.url,
        body: article.content,              // content -> body
        author: article.author,
        published_at: article.published_at,
        collected_at: article.crawled_at,   // crawled_at -> collected_at
        is_analyzed: false,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("raw_articles")
        .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
        .select("id");

      if (insertError) {
        logger.error(`Batch insert failed at offset ${i}`, {
          error: insertError.message,
        });
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }

      const ids = (inserted ?? []).map((r) => r.id);
      allNewIds.push(...ids);

      logger.info(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}`, {
        batchSize: batch.length,
        insertedCount: ids.length,
      });
    }

    logger.info("Raw article storage complete", {
      newCount: allNewIds.length,
      duplicateCount,
    });

    return { newArticleIds: allNewIds, duplicateCount };
  },
});

// ---------------------------------------------------------------------------
// Task: store-analysis-results
// ---------------------------------------------------------------------------

export const storeAnalysisResults = task({
  id: "store-analysis-results",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    results: AnalysisResult[];
  }): Promise<StoreAnalysisResultsResult> => {
    const { results } = payload;

    if (results.length === 0) {
      logger.info("No analysis results to store");
      return { storedCount: 0 };
    }

    logger.info(`Storing ${results.length} analysis results`);

    let storedCount = 0;

    for (const result of results) {
      try {
        // 1. Mark raw_articles as analyzed
        const { error: updateError } = await supabase
          .from("raw_articles")
          .update({ is_analyzed: true })
          .eq("id", result.article_id);

        if (updateError) {
          logger.error(`Failed to mark article ${result.article_id} as analyzed`, {
            error: updateError.message,
          });
          continue;
        }

        // 2. Insert into analyzed_articles table
        const isSignificant = result.relevance_score >= 0.5;

        const { data: analyzedRow, error: insertError } = await supabase
          .from("analyzed_articles")
          .upsert(
            {
              raw_article_id: result.article_id,
              keywords: result.key_topics,
              entities: result.key_entities,
              relevance_score: result.relevance_score,
              is_significant: isSignificant,
              significance_reason: result.election_relevance,
              sentiment: result.sentiment,
              sentiment_score: result.relevance_score, // approximate
              ai_summary: result.summary,
              related_province_codes: result.province_codes,
              trend_signal: isSignificant ? "rising" : "stable",
              analyzed_at: new Date().toISOString(),
              analyzer_model: "claude-sonnet-4-6",
            },
            { onConflict: "raw_article_id", ignoreDuplicates: false },
          )
          .select("id")
          .single();

        if (insertError) {
          logger.error(`Failed to insert analyzed article for ${result.article_id}`, {
            error: insertError.message,
          });
          continue;
        }

        const analyzedArticleId = analyzedRow.id;

        // 3. Insert candidate sentiments (resolve names to UUIDs)
        if (result.candidate_sentiments.length > 0) {
          for (const cs of result.candidate_sentiments) {
            const provinceId = await resolveProvinceId(cs.province_code);
            if (!provinceId) continue;

            const candidateId = await resolveCandidateId(
              provinceId,
              cs.candidate_name,
              cs.party,
            );

            if (!candidateId) {
              logger.warn(
                `Candidate not found: ${cs.candidate_name} (${cs.party}) in ${cs.province_code}`,
              );
              continue;
            }

            const { error: sentimentError } = await supabase
              .from("candidate_sentiments")
              .insert({
                article_id: analyzedArticleId,   // references analyzed_articles.id
                candidate_id: candidateId,        // references candidates.id
                sentiment: cs.sentiment,
                sentiment_score: cs.sentiment_score,
                context: cs.context,
                analyzed_at: new Date().toISOString(),
              });

            if (sentimentError) {
              logger.warn(
                `Failed to store sentiment for ${cs.candidate_name}`,
                { error: sentimentError.message },
              );
            }
          }
        }

        storedCount++;
      } catch (err) {
        logger.error(`Unexpected error storing analysis for ${result.article_id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Analysis results storage complete", { storedCount });

    return { storedCount };
  },
});
