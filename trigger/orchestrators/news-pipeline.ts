import { schedules, task, logger, batch } from "@trigger.dev/sdk/v3";
import { bigkindsNlpAnalyze } from "../crawlers/bigkinds-crawler";
import {
  storeRawArticles,
  storeAnalysisResults,
  type RawArticle,
  type AnalysisResult,
} from "../stores/article-store";
import { upsertIssues, type IssueData } from "../stores/issue-store";
import {
  ELECTION_KEYWORDS,
  RSS_FEEDS,
  DISTRICT_COLLECTION_PROVINCES,
  PROVINCE_CODE_TO_NAME,
  DISTRICT_QUERY_TEMPLATES,
} from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrawledArticle {
  source: string;
  source_id: string;
  title: string;
  url: string;
  content: string | null;
  published_at: string | null;
  author: string | null;
  image_url: string | null;
}

interface ClaudeAnalysis {
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
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

interface PipelineStats {
  triggeredAt: string;
  completedAt: string;
  phase1_crawled: number;
  phase2_deduplicated: number;
  phase3_stored: number;
  phase4_nlpAnalyzed: number;
  phase5_relevant: number;
  phase6_deepAnalyzed: number;
  phase7_analysisStored: number;
  phase8_issuesUpdated: number;
}

// ---------------------------------------------------------------------------
// Schedule: every 4 hours KST
// ---------------------------------------------------------------------------

export const newsPipelineSchedule = schedules.task({
  id: "news-pipeline-cron",
  cron: { pattern: "0 2,6,10,14,18,22 * * *", timezone: "Asia/Seoul" },
  run: async (payload) => {
    logger.info("News pipeline cron triggered", {
      timestamp: payload.timestamp.toISOString(),
    });

    const result = await newsPipelineOrchestrator.triggerAndWait({
      triggeredAt: payload.timestamp.toISOString(),
    });

    logger.info("News pipeline cron completed", { result });
    return result;
  },
});

// ---------------------------------------------------------------------------
// Orchestrator: news-pipeline
// ---------------------------------------------------------------------------

export const newsPipelineOrchestrator = task({
  id: "news-pipeline",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: { triggeredAt: string }): Promise<PipelineStats> => {
    const startTime = Date.now();
    logger.info("News pipeline started", { triggeredAt: payload.triggeredAt });

    // ------------------------------------------------------------------
    // Phase 0.5: Fetch district names from DB for district-level crawling
    // ------------------------------------------------------------------
    logger.info("Phase 0.5: Loading district names from DB");

    const districtKeywords = await fetchDistrictKeywords.triggerAndWait({});
    const districtKeywordList: string[] = districtKeywords.ok
      ? districtKeywords.output.keywords
      : [];

    logger.info(`Loaded ${districtKeywordList.length} district-level keywords`);

    // ------------------------------------------------------------------
    // Phase 1: Fan-out crawling (parallel)
    // ------------------------------------------------------------------
    logger.info("Phase 1: Fan-out crawling (province + district level)");

    const crawlBatchPayloads: Array<{ id: string; payload: any }> = [
      // Naver News API crawl for province-level election keywords
      {
        id: naverNewsCrawler.id,
        payload: {
          keywords: ELECTION_KEYWORDS.slice(0, 10),
          maxResults: 100,
          sort: "date",
        },
      },
      // RSS feeds crawl
      {
        id: rssFeedsCrawler.id,
        payload: {
          feeds: RSS_FEEDS,
          maxItemsPerFeed: 20,
        },
      },
      // Community/blog crawl
      {
        id: communityCrawler.id,
        payload: {
          keywords: ELECTION_KEYWORDS.slice(0, 5),
          maxResults: 50,
        },
      },
    ];

    // Add district-level keyword batches (split into batches of 15 to stay within rate limits)
    if (districtKeywordList.length > 0) {
      const DISTRICT_BATCH_SIZE = 15;
      for (let i = 0; i < districtKeywordList.length; i += DISTRICT_BATCH_SIZE) {
        crawlBatchPayloads.push({
          id: naverNewsCrawler.id,
          payload: {
            keywords: districtKeywordList.slice(i, i + DISTRICT_BATCH_SIZE),
            maxResults: 10,
            sort: "date",
          },
        });
      }
    }

    const crawlResults = await batch.triggerAndWait<typeof naverNewsCrawler>(
      crawlBatchPayloads as any,
    );

    // Collect all articles from all crawlers
    const allArticles: CrawledArticle[] = [];

    for (const result of crawlResults.runs) {
      if (result.ok) {
        const articles = (result.output as any)?.articles ?? [];
        allArticles.push(...articles);
      } else {
        logger.warn("A crawler task failed", {
          error: result.error,
        });
      }
    }

    logger.info(`Phase 1 complete: ${allArticles.length} articles crawled`);

    // ------------------------------------------------------------------
    // Phase 2: Deduplicate
    // ------------------------------------------------------------------
    logger.info("Phase 2: Deduplication");

    const seen = new Set<string>();
    const deduplicated: CrawledArticle[] = [];

    for (const article of allArticles) {
      // Dedup key: URL or source+source_id
      const key = article.url || `${article.source}::${article.source_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(article);
      }
    }

    logger.info(
      `Phase 2 complete: ${deduplicated.length} unique articles (removed ${allArticles.length - deduplicated.length} duplicates)`,
    );

    // ------------------------------------------------------------------
    // Phase 3: Store raw articles
    // ------------------------------------------------------------------
    logger.info("Phase 3: Storing raw articles");

    const rawArticles: RawArticle[] = deduplicated.map((a) => ({
      source: a.source,
      source_id: a.source_id,
      title: a.title,
      url: a.url,
      content: a.content,
      published_at: a.published_at,
      author: a.author,
      image_url: a.image_url,
      crawled_at: new Date().toISOString(),
      metadata: {},
    }));

    const storeResult = await storeRawArticles.triggerAndWait({
      articles: rawArticles,
    });

    const newArticleIds = storeResult.ok
      ? storeResult.output.newArticleIds
      : [];

    logger.info(`Phase 3 complete: ${newArticleIds.length} new articles stored`);

    if (newArticleIds.length === 0) {
      logger.info("No new articles to process, pipeline complete");
      return buildStats(payload.triggeredAt, {
        crawled: allArticles.length,
        deduplicated: deduplicated.length,
        stored: 0,
      });
    }

    // ------------------------------------------------------------------
    // Phase 4: Batch NLP analysis via BigKinds
    // ------------------------------------------------------------------
    logger.info("Phase 4: BigKinds NLP analysis");

    // Only analyze articles that have content
    const articlesWithContent = deduplicated.filter(
      (a) => a.content && a.content.trim().length > 50,
    );

    // Batch NLP analysis (max 20 concurrent)
    const nlpBatchPayloads = articlesWithContent.slice(0, 200).map((a) => ({
      id: bigkindsNlpAnalyze.id,
      payload: {
        text: a.content!,
        title: a.title,
      },
    }));

    const nlpBatchResult = nlpBatchPayloads.length > 0
      ? await batch.triggerAndWait<typeof bigkindsNlpAnalyze>(nlpBatchPayloads)
      : null;

    const nlpRuns = nlpBatchResult?.runs ?? [];

    const nlpSuccessCount = nlpRuns.filter((r) => r.ok).length;

    logger.info(`Phase 4 complete: ${nlpSuccessCount} articles NLP-analyzed`);

    // ------------------------------------------------------------------
    // Phase 5: Filter by relevance score >= 0.3
    // ------------------------------------------------------------------
    logger.info("Phase 5: Filtering by relevance");

    const relevantArticles: Array<{
      article: CrawledArticle;
      articleId: string;
      nlpResult: any;
    }> = [];

    for (let idx = 0; idx < nlpRuns.length; idx++) {
      const nlpResult = nlpRuns[idx];
      if (!nlpResult.ok) continue;

      const output = nlpResult.output;
      // Compute relevance from NLP signals
      const relevance = computeRelevanceScore(
        articlesWithContent[idx],
        output,
      );

      if (relevance >= 0.3) {
        relevantArticles.push({
          article: articlesWithContent[idx],
          articleId: newArticleIds[idx] ?? `unknown-${idx}`,
          nlpResult: output,
        });
      }
    }

    logger.info(
      `Phase 5 complete: ${relevantArticles.length} relevant articles (threshold >= 0.3)`,
    );

    // ------------------------------------------------------------------
    // Phase 6: Claude deep analysis for relevant articles
    // ------------------------------------------------------------------
    logger.info("Phase 6: Claude deep analysis");

    const deepAnalysisBatch = relevantArticles.slice(0, 50).map((item) => ({
      id: claudeDeepAnalysis.id,
      payload: {
        article_id: item.articleId,
        title: item.article.title,
        content: item.article.content ?? "",
        nlp_entities: item.nlpResult?.entities ?? [],
        nlp_keywords: item.nlpResult?.keywords?.keywords ?? [],
        nlp_summary: item.nlpResult?.summary?.summary ?? null,
      },
    }));

    const deepBatchResult = deepAnalysisBatch.length > 0
      ? await batch.triggerAndWait<typeof claudeDeepAnalysis>(deepAnalysisBatch)
      : null;

    const deepRuns = deepBatchResult?.runs ?? [];

    const analysisResults: AnalysisResult[] = [];

    for (const result of deepRuns) {
      if (result.ok && result.output) {
        analysisResults.push(result.output as AnalysisResult);
      }
    }

    logger.info(
      `Phase 6 complete: ${analysisResults.length} articles deep-analyzed`,
    );

    // ------------------------------------------------------------------
    // Phase 7: Store analysis results
    // ------------------------------------------------------------------
    logger.info("Phase 7: Storing analysis results");

    const storeAnalysisResult = await storeAnalysisResults.triggerAndWait({
      results: analysisResults,
    });

    const analysisStoredCount = storeAnalysisResult.ok
      ? storeAnalysisResult.output.storedCount
      : 0;

    logger.info(`Phase 7 complete: ${analysisStoredCount} analysis results stored`);

    // ------------------------------------------------------------------
    // Phase 8: Update hot topics / issues
    // ------------------------------------------------------------------
    logger.info("Phase 8: Updating hot topics");

    const issueMap = new Map<string, IssueData>();

    for (const analysis of analysisResults) {
      for (const topic of analysis.key_topics) {
        const existing = issueMap.get(topic);
        if (existing) {
          existing.related_article_ids.push(analysis.article_id);
          // Merge province codes
          for (const pc of analysis.province_codes) {
            if (!existing.province_codes.includes(pc)) {
              existing.province_codes.push(pc);
            }
          }
        } else {
          issueMap.set(topic, {
            keyword: topic,
            category: "election",
            province_codes: [...analysis.province_codes],
            related_article_ids: [analysis.article_id],
            sentiment: analysis.sentiment as any,
            importance_score: analysis.relevance_score,
            first_seen_at: new Date().toISOString(),
            related_ministry: null,
          });
        }
      }
    }

    const issuesArray = Array.from(issueMap.values());

    let issuesUpdated = 0;
    if (issuesArray.length > 0) {
      const issueResult = await upsertIssues.triggerAndWait({
        issues: issuesArray,
      });
      issuesUpdated = issueResult.ok
        ? issueResult.output.newIssueCount + issueResult.output.updatedIssueCount
        : 0;
    }

    logger.info(`Phase 8 complete: ${issuesUpdated} issues updated`);

    // ------------------------------------------------------------------
    // Final stats
    // ------------------------------------------------------------------
    const stats: PipelineStats = {
      triggeredAt: payload.triggeredAt,
      completedAt: new Date().toISOString(),
      phase1_crawled: allArticles.length,
      phase2_deduplicated: deduplicated.length,
      phase3_stored: newArticleIds.length,
      phase4_nlpAnalyzed: nlpSuccessCount,
      phase5_relevant: relevantArticles.length,
      phase6_deepAnalyzed: analysisResults.length,
      phase7_analysisStored: analysisStoredCount,
      phase8_issuesUpdated: issuesUpdated,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`News pipeline complete in ${elapsed}s`, { stats });

    return stats;
  },
});

// ---------------------------------------------------------------------------
// Sub-tasks (crawlers referenced by orchestrator)
// ---------------------------------------------------------------------------

export const naverNewsCrawler = task({
  id: "naver-news-crawler",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    keywords: string[];
    maxResults: number;
    sort: "date" | "sim";
  }) => {
    const { keywords, maxResults, sort } = payload;
    logger.info("Naver News crawler started", { keywordCount: keywords.length });

    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? "";
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? "";

    const articles: CrawledArticle[] = [];

    for (const keyword of keywords) {
      try {
        const params = new URLSearchParams({
          query: keyword,
          display: String(Math.min(maxResults, 100)),
          start: "1",
          sort: sort === "date" ? "date" : "sim",
        });

        const response = await fetch(
          `https://openapi.naver.com/v1/search/news.json?${params}`,
          {
            headers: {
              "X-Naver-Client-Id": NAVER_CLIENT_ID,
              "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
            },
          },
        );

        if (!response.ok) {
          logger.warn(`Naver API error for keyword "${keyword}"`, {
            status: response.status,
          });
          continue;
        }

        const data = (await response.json()) as {
          items: Array<{
            title: string;
            originallink: string;
            link: string;
            description: string;
            pubDate: string;
          }>;
        };

        for (const item of data.items ?? []) {
          articles.push({
            source: "naver",
            source_id: encodeURIComponent(item.originallink || item.link),
            title: stripHtml(item.title),
            url: item.originallink || item.link,
            content: stripHtml(item.description),
            published_at: new Date(item.pubDate).toISOString(),
            author: null,
            image_url: null,
          });
        }

        // Rate limit: 100ms between requests
        await delay(100);
      } catch (err) {
        logger.error(`Naver crawler error for keyword "${keyword}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Naver News crawler complete: ${articles.length} articles`);
    return { articles };
  },
});

export const rssFeedsCrawler = task({
  id: "rss-feeds-crawler",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 60_000 },
  run: async (payload: {
    feeds: Array<{ name: string; url: string }>;
    maxItemsPerFeed: number;
  }) => {
    const { feeds, maxItemsPerFeed } = payload;
    logger.info("RSS feeds crawler started", { feedCount: feeds.length });

    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    const articles: CrawledArticle[] = [];

    for (const feed of feeds) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch(feed.url, {
          signal: controller.signal,
          headers: { "User-Agent": "KukmuBot/1.0" },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          logger.warn(`RSS feed ${feed.name} returned ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const parsed = parser.parse(xml);

        // Handle both RSS 2.0 and Atom formats
        const items =
          parsed?.rss?.channel?.item ??
          parsed?.feed?.entry ??
          [];

        const itemArray = Array.isArray(items) ? items : [items];

        for (const item of itemArray.slice(0, maxItemsPerFeed)) {
          if (!item) continue;

          const title = item.title ?? "";
          const link =
            item.link?.["@_href"] ?? item.link ?? item.guid ?? "";
          const description = item.description ?? item.summary ?? item.content ?? "";
          const pubDate = item.pubDate ?? item.published ?? item.updated ?? null;

          articles.push({
            source: `rss:${feed.name}`,
            source_id: encodeURIComponent(String(link)),
            title: stripHtml(String(title)),
            url: String(link),
            content: stripHtml(String(description)),
            published_at: pubDate ? new Date(pubDate).toISOString() : null,
            author: item.author ?? item["dc:creator"] ?? null,
            image_url: null,
          });
        }
      } catch (err) {
        logger.warn(`RSS feed ${feed.name} crawl failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`RSS feeds crawler complete: ${articles.length} articles`);
    return { articles };
  },
});

export const communityCrawler = task({
  id: "community-crawler",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: { keywords: string[]; maxResults: number }) => {
    const { keywords, maxResults } = payload;
    logger.info("Community/blog crawler started", {
      keywordCount: keywords.length,
    });

    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? "";
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? "";

    const articles: CrawledArticle[] = [];

    for (const keyword of keywords) {
      try {
        const params = new URLSearchParams({
          query: keyword,
          display: String(Math.min(maxResults, 50)),
          start: "1",
          sort: "date",
        });

        const response = await fetch(
          `https://openapi.naver.com/v1/search/blog.json?${params}`,
          {
            headers: {
              "X-Naver-Client-Id": NAVER_CLIENT_ID,
              "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
            },
          },
        );

        if (!response.ok) {
          logger.warn(`Naver Blog API error for "${keyword}"`, {
            status: response.status,
          });
          continue;
        }

        const data = (await response.json()) as {
          items: Array<{
            title: string;
            link: string;
            description: string;
            bloggername: string;
            postdate: string;
          }>;
        };

        for (const item of data.items ?? []) {
          articles.push({
            source: "naver-blog",
            source_id: encodeURIComponent(item.link),
            title: stripHtml(item.title),
            url: item.link,
            content: stripHtml(item.description),
            published_at: formatNaverDate(item.postdate),
            author: item.bloggername ?? null,
            image_url: null,
          });
        }

        await delay(100);
      } catch (err) {
        logger.error(`Community crawler error for "${keyword}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Community crawler complete: ${articles.length} articles`);
    return { articles };
  },
});

export const claudeDeepAnalysis = task({
  id: "claude-deep-analysis",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async (payload: {
    article_id: string;
    title: string;
    content: string;
    nlp_entities: Array<{ text: string; type: string }>;
    nlp_keywords: Array<{ word: string; weight: number }>;
    nlp_summary: string | null;
  }): Promise<AnalysisResult> => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const { article_id, title, content, nlp_entities, nlp_keywords, nlp_summary } =
      payload;

    logger.info(`Claude deep analysis for article ${article_id}`, {
      titleLength: title.length,
      contentLength: content.length,
    });

    const entityContext = nlp_entities
      .slice(0, 20)
      .map((e) => `${e.text} (${e.type})`)
      .join(", ");

    const keywordContext = nlp_keywords
      .slice(0, 15)
      .map((k) => k.word)
      .join(", ");

    const prompt = `당신은 2026년 6.3 전국동시지방선거 분석 전문가입니다.

다음 뉴스 기사를 분석하여 JSON 형식으로 결과를 반환하세요.

기사 제목: ${title}
기사 내용: ${content.slice(0, 5000)}
${nlp_summary ? `NLP 요약: ${nlp_summary}` : ""}
${entityContext ? `추출된 개체명: ${entityContext}` : ""}
${keywordContext ? `핵심 키워드: ${keywordContext}` : ""}

분석 결과를 다음 JSON 형식으로 반환하세요:
{
  "summary": "기사 핵심 요약 (2-3문장, 한국어)",
  "sentiment": "positive" | "negative" | "neutral",
  "relevance_score": 0.0-1.0 (지방선거 관련도),
  "key_entities": [{"name": "이름", "type": "PERSON|ORG|LOC"}],
  "key_topics": ["주제1", "주제2"],
  "province_codes": ["seoul", "busan"] (관련 광역시도 코드),
  "candidate_sentiments": [
    {
      "candidate_name": "후보명",
      "party": "정당명",
      "province_code": "지역코드",
      "sentiment": "positive" | "negative" | "neutral",
      "sentiment_score": -1.0 ~ 1.0,
      "context": "해당 후보 관련 맥락 요약"
    }
  ],
  "election_relevance": "선거에 미치는 영향 분석 (null if not relevant)"
}

JSON만 반환하세요. 마크다운이나 추가 설명은 포함하지 마세요.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: ClaudeAnalysis;
    try {
      // Extract JSON from response (handle possible markdown wrapping)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in Claude response");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      logger.error("Failed to parse Claude analysis response", {
        article_id,
        text: text.slice(0, 500),
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      // Return minimal valid result
      return {
        article_id,
        summary: nlp_summary ?? title,
        sentiment: "neutral",
        relevance_score: 0.3,
        key_entities: [],
        key_topics: [],
        province_codes: [],
        candidate_sentiments: [],
        election_relevance: null,
      };
    }

    const result: AnalysisResult = {
      article_id,
      summary: parsed.summary ?? title,
      sentiment: parsed.sentiment ?? "neutral",
      relevance_score: Math.max(0, Math.min(1, parsed.relevance_score ?? 0.3)),
      key_entities: parsed.key_entities ?? [],
      key_topics: parsed.key_topics ?? [],
      province_codes: parsed.province_codes ?? [],
      candidate_sentiments: (parsed.candidate_sentiments ?? []).map((cs) => ({
        candidate_name: cs.candidate_name,
        party: cs.party,
        province_code: cs.province_code,
        sentiment: cs.sentiment ?? "neutral",
        sentiment_score: Math.max(-1, Math.min(1, cs.sentiment_score ?? 0)),
        context: cs.context ?? "",
      })),
      election_relevance: parsed.election_relevance ?? null,
    };

    logger.info(`Claude analysis complete for ${article_id}`, {
      relevance: result.relevance_score,
      sentiment: result.sentiment,
      topicCount: result.key_topics.length,
      candidateCount: result.candidate_sentiments.length,
    });

    return result;
  },
});

// ---------------------------------------------------------------------------
// Sub-task: fetch district keywords from DB
// ---------------------------------------------------------------------------

export const fetchDistrictKeywords = task({
  id: "fetch-district-keywords",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 15_000 },
  run: async (_payload: Record<string, never>): Promise<{ keywords: string[] }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const allKeywords: string[] = [];

    for (const provinceCode of DISTRICT_COLLECTION_PROVINCES) {
      const provinceName = PROVINCE_CODE_TO_NAME[provinceCode];
      if (!provinceName) continue;

      // Look up the province
      const { data: provRow } = await sb
        .from("provinces")
        .select("id")
        .eq("code", provinceCode)
        .maybeSingle();

      if (!provRow) {
        logger.warn(`Province not found in DB: ${provinceCode}`);
        continue;
      }

      // Fetch districts for this province
      const { data: districts } = await sb
        .from("districts")
        .select("name")
        .eq("province_id", provRow.id);

      if (!districts || districts.length === 0) {
        logger.warn(`No districts found for ${provinceCode}`);
        continue;
      }

      const districtNames = districts.map((d) => d.name);

      // Generate keywords from templates
      for (const districtName of districtNames) {
        for (const template of DISTRICT_QUERY_TEMPLATES) {
          allKeywords.push(
            template
              .replace("{province}", provinceName)
              .replace("{district}", districtName),
          );
        }
      }

      logger.info(`Generated ${districtNames.length * DISTRICT_QUERY_TEMPLATES.length} keywords for ${provinceName}`);
    }

    return { keywords: allKeywords };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNaverDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

function computeRelevanceScore(
  article: CrawledArticle,
  nlpOutput: any,
): number {
  let score = 0;

  // Check title against election keywords
  const titleLower = article.title.toLowerCase();
  const contentLower = (article.content ?? "").toLowerCase();

  for (const keyword of ELECTION_KEYWORDS) {
    if (titleLower.includes(keyword)) {
      score += 0.15;
    }
    if (contentLower.includes(keyword)) {
      score += 0.05;
    }
  }

  // NLP classification boost
  if (nlpOutput?.classification?.category === "politics") {
    score += 0.2;
  }

  // Entity presence boost (person/org names related to politics)
  const entityCount = (nlpOutput?.entities ?? []).filter(
    (e: any) => e.type === "PER" || e.type === "ORG",
  ).length;
  score += Math.min(entityCount * 0.02, 0.1);

  // Keyword relevance boost
  const kwCount = (nlpOutput?.keywords?.keywords ?? []).length;
  score += Math.min(kwCount * 0.01, 0.1);

  return Math.min(score, 1.0);
}

function buildStats(
  triggeredAt: string,
  partial: { crawled: number; deduplicated: number; stored: number },
): PipelineStats {
  return {
    triggeredAt,
    completedAt: new Date().toISOString(),
    phase1_crawled: partial.crawled,
    phase2_deduplicated: partial.deduplicated,
    phase3_stored: partial.stored,
    phase4_nlpAnalyzed: 0,
    phase5_relevant: 0,
    phase6_deepAnalyzed: 0,
    phase7_analysisStored: 0,
    phase8_issuesUpdated: 0,
  };
}
