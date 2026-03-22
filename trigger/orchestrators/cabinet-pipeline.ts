import { schedules, task, logger, batch } from "@trigger.dev/sdk/v3";
import { upsertIssues, type IssueData } from "../stores/issue-store";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
}

interface CrawledCabinetArticle {
  title: string;
  url: string;
  published_at: string | null;
  full_text: string;
}

interface StructuredAgenda {
  title: string;
  ministry: string;
  minister_name: string;
  priority: "high" | "medium" | "low"; // mapped to DB: urgent/normal/low
  category: string;
  description: string;
  related_keywords: string[];
}

/** Map pipeline priority to DB enum */
function mapPriorityToDb(priority: string): "urgent" | "normal" | "low" {
  if (priority === "high") return "urgent";
  if (priority === "medium") return "normal";
  return "low";
}

interface CabinetPipelineStats {
  triggeredAt: string;
  completedAt: string;
  rssItemsFound: number;
  cabinetItemsFiltered: number;
  articlesCrawled: number;
  agendasStructured: number;
  agendasStored: number;
  issuesMapped: number;
}

// Supabase client imported from shared lib

// ---------------------------------------------------------------------------
// Schedule: every Wednesday at 9 AM KST
// ---------------------------------------------------------------------------

export const cabinetPipelineSchedule = schedules.task({
  id: "cabinet-pipeline-cron",
  cron: { pattern: "0 9 * * 3", timezone: "Asia/Seoul" },
  run: async (payload) => {
    logger.info("Cabinet pipeline cron triggered", {
      timestamp: payload.timestamp.toISOString(),
    });

    const result = await cabinetPipelineOrchestrator.triggerAndWait({
      triggeredAt: payload.timestamp.toISOString(),
    });

    logger.info("Cabinet pipeline cron completed", { result });
    return result;
  },
});

// ---------------------------------------------------------------------------
// Orchestrator: cabinet-pipeline
// ---------------------------------------------------------------------------

export const cabinetPipelineOrchestrator = task({
  id: "cabinet-pipeline",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: {
    triggeredAt: string;
  }): Promise<CabinetPipelineStats> => {
    const startTime = Date.now();
    logger.info("Cabinet pipeline started", {
      triggeredAt: payload.triggeredAt,
    });

    // ------------------------------------------------------------------
    // Step 1: Crawl Korea.kr policy briefing RSS
    // ------------------------------------------------------------------
    logger.info("Step 1: Crawling Korea.kr RSS");

    const rssResult = await koreaKrRssCrawler.triggerAndWait({
      feedUrl: "https://www.korea.kr/rss/policy.xml",
      maxItems: 50,
    });

    const allRssItems: RssItem[] = rssResult.ok
      ? rssResult.output.items
      : [];

    logger.info(`Step 1 complete: ${allRssItems.length} RSS items found`);

    // ------------------------------------------------------------------
    // Step 2: Filter for 국무회의 items
    // ------------------------------------------------------------------
    logger.info("Step 2: Filtering for cabinet meeting items");

    const cabinetKeywords = [
      "국무회의",
      "국무총리",
      "국무위원",
      "정부 정책",
      "대통령 주재",
      "의결",
      "차관회의",
      "각의",
    ];

    const cabinetItems = allRssItems.filter((item) => {
      const text = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return cabinetKeywords.some((kw) => text.includes(kw));
    });

    logger.info(
      `Step 2 complete: ${cabinetItems.length} cabinet-related items filtered`,
    );

    if (cabinetItems.length === 0) {
      logger.info("No cabinet meeting items found, pipeline complete");
      return buildCabinetStats(payload.triggeredAt, {
        rssItemsFound: allRssItems.length,
      });
    }

    // ------------------------------------------------------------------
    // Step 3: Crawl full article text (parallel)
    // ------------------------------------------------------------------
    logger.info("Step 3: Crawling full article texts");

    const crawlPayloads = cabinetItems.map((item) => ({
      id: articleFullTextCrawler.id,
      payload: {
        url: item.link,
        title: item.title,
        published_at: item.pubDate,
      },
    }));

    const crawlResults = await batch.triggerAndWait<typeof articleFullTextCrawler>(
      crawlPayloads,
    );

    const crawledArticles: CrawledCabinetArticle[] = [];

    for (const result of crawlResults.runs) {
      if (result.ok && result.output) {
        crawledArticles.push(result.output);
      }
    }

    logger.info(`Step 3 complete: ${crawledArticles.length} articles crawled`);

    // ------------------------------------------------------------------
    // Step 4: Claude structures agendas
    // ------------------------------------------------------------------
    logger.info("Step 4: Structuring agendas with Claude");

    const structurePayloads = crawledArticles.map((article) => ({
      id: claudeStructureAgenda.id,
      payload: {
        title: article.title,
        full_text: article.full_text,
        published_at: article.published_at,
      },
    }));

    const structureResults = await batch.triggerAndWait<typeof claudeStructureAgenda>(
      structurePayloads,
    );

    const allAgendas: StructuredAgenda[] = [];

    for (const result of structureResults.runs) {
      if (result.ok && result.output) {
        allAgendas.push(...(result.output.agendas ?? []));
      }
    }

    logger.info(`Step 4 complete: ${allAgendas.length} agendas structured`);

    // ------------------------------------------------------------------
    // Step 5: Store agendas
    // ------------------------------------------------------------------
    logger.info("Step 5: Storing agendas");

    let storedCount = 0;

    for (const agenda of allAgendas) {
      try {
        const { error } = await supabase.from("agendas").insert({
            title: agenda.title,
            ministry: agenda.ministry,
            minister_name: agenda.minister_name,
            status: "proposed" as const,
            date: new Date().toISOString().split("T")[0],
            category: agenda.category,
            priority: mapPriorityToDb(agenda.priority),
            description: agenda.description,
          });

        if (error) {
          logger.warn(`Failed to store agenda: ${agenda.title}`, {
            error: error.message,
          });
          continue;
        }

        storedCount++;
      } catch (err) {
        logger.error(`Unexpected error storing agenda: ${agenda.title}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Step 5 complete: ${storedCount} agendas stored`);

    // ------------------------------------------------------------------
    // Step 6: Map agendas to election issues
    // ------------------------------------------------------------------
    logger.info("Step 6: Mapping agendas to election issues");

    const agendaIssues: IssueData[] = allAgendas
      .filter((a) => a.related_keywords.length > 0)
      .flatMap((a) =>
        a.related_keywords.map((keyword) => ({
          keyword,
          category: a.category,
          province_codes: [] as string[],
          related_article_ids: [] as string[],
          sentiment: "neutral" as const,
          importance_score: a.priority === "high" ? 0.9 : a.priority === "medium" ? 0.6 : 0.3,
          first_seen_at: new Date().toISOString(),
          related_ministry: a.ministry,
        })),
      );

    // Deduplicate by keyword
    const uniqueIssues = new Map<string, IssueData>();
    for (const issue of agendaIssues) {
      if (!uniqueIssues.has(issue.keyword)) {
        uniqueIssues.set(issue.keyword, issue);
      }
    }

    const issuesList = Array.from(uniqueIssues.values());
    let issuesMapped = 0;

    if (issuesList.length > 0) {
      const issueResult = await upsertIssues.triggerAndWait({
        issues: issuesList,
      });
      issuesMapped = issueResult.ok
        ? issueResult.output.newIssueCount + issueResult.output.updatedIssueCount
        : 0;
    }

    logger.info(`Step 6 complete: ${issuesMapped} issues mapped`);

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------
    const stats: CabinetPipelineStats = {
      triggeredAt: payload.triggeredAt,
      completedAt: new Date().toISOString(),
      rssItemsFound: allRssItems.length,
      cabinetItemsFiltered: cabinetItems.length,
      articlesCrawled: crawledArticles.length,
      agendasStructured: allAgendas.length,
      agendasStored: storedCount,
      issuesMapped,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Cabinet pipeline complete in ${elapsed}s`, { stats });

    return stats;
  },
});

// ---------------------------------------------------------------------------
// Sub-tasks
// ---------------------------------------------------------------------------

export const koreaKrRssCrawler = task({
  id: "korea-kr-rss-crawler",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: { feedUrl: string; maxItems: number }) => {
    const { feedUrl, maxItems } = payload;
    logger.info("Korea.kr RSS crawler started", { feedUrl });

    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "KukmuBot/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Korea.kr RSS returned ${response.status}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    const rawItems = parsed?.rss?.channel?.item ?? [];
    const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];

    const items: RssItem[] = itemArray
      .slice(0, maxItems)
      .map((item: any) => ({
        title: String(item.title ?? "").trim(),
        link: String(item.link ?? "").trim(),
        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        description: item.description
          ? String(item.description).replace(/<[^>]*>/g, "").trim()
          : null,
      }));

    logger.info(`Korea.kr RSS: ${items.length} items parsed`);
    return { items };
  },
});

export const articleFullTextCrawler = task({
  id: "article-full-text-crawler",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 20_000 },
  run: async (payload: {
    url: string;
    title: string;
    published_at: string | null;
  }): Promise<CrawledCabinetArticle> => {
    const { url, title, published_at } = payload;
    logger.info(`Crawling full text: ${url}`);

    const cheerio = await import("cheerio");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Article page returned ${response.status}: ${url}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try common article content selectors
    const selectors = [
      ".article_body",
      ".article-body",
      ".view_cont",
      "#articleBody",
      ".content_view",
      ".news_body",
      "#divViewConts",
      "article",
      ".entry-content",
    ];

    let fullText = "";
    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        fullText = el.text().replace(/\s+/g, " ").trim();
        if (fullText.length > 100) break;
      }
    }

    // Fallback: body text
    if (fullText.length < 100) {
      fullText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);
    }

    logger.info(`Crawled article: ${title} (${fullText.length} chars)`);

    return {
      title,
      url,
      published_at,
      full_text: fullText.slice(0, 15000),
    };
  },
});

export const claudeStructureAgenda = task({
  id: "claude-structure-agenda",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async (payload: {
    title: string;
    full_text: string;
    published_at: string | null;
  }): Promise<{ agendas: StructuredAgenda[] }> => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const { title, full_text, published_at } = payload;

    logger.info(`Structuring agenda from article: ${title}`);

    const prompt = `당신은 대한민국 국무회의 안건 분석 전문가입니다.

다음 정책 브리핑 기사에서 국무회의 안건을 추출하여 구조화하세요.

기사 제목: ${title}
발행일: ${published_at ?? "미상"}
기사 내용:
${full_text.slice(0, 6000)}

각 안건을 다음 JSON 형식으로 반환하세요:
{
  "agendas": [
    {
      "title": "안건 제목",
      "ministry": "소관 부처명",
      "minister_name": "담당 장관명 (알 수 없으면 빈 문자열)",
      "priority": "high|medium|low",
      "category": "경제|사회|외교|안보|교육|환경|복지|과학기술|문화|행정|기타",
      "description": "안건 상세 설명 (2-3문장)",
      "related_keywords": ["지방선거와 관련될 수 있는 키워드들"]
    }
  ]
}

규칙:
1. 기사에서 언급된 모든 안건을 추출하세요
2. priority는 국민 생활 영향도 기준으로 판단
3. related_keywords는 6.3 전국동시지방선거와 연관될 수 있는 키워드를 포함
4. 안건이 없으면 빈 배열을 반환

JSON만 반환하세요.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: { agendas: StructuredAgenda[] };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      logger.error("Failed to parse Claude agenda structure response", {
        title,
        text: text.slice(0, 500),
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return { agendas: [] };
    }

    // Validate and normalize
    const agendas: StructuredAgenda[] = (parsed.agendas ?? []).map((a) => ({
      title: a.title ?? title,
      ministry: a.ministry ?? "미정",
      minister_name: a.minister_name ?? "",
      priority: (["high", "medium", "low"].includes(a.priority) ? a.priority : "medium") as "high" | "medium" | "low",
      category: a.category ?? "기타",
      description: a.description ?? "",
      related_keywords: a.related_keywords ?? [],
    }));

    logger.info(`Structured ${agendas.length} agendas from: ${title}`);
    return { agendas };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAgendaId(title: string): string {
  const normalized = title
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "")
    .slice(0, 30);
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  return `agenda-${dateStr}-${normalized}-${Date.now().toString(36)}`;
}

function buildCabinetStats(
  triggeredAt: string,
  partial: Partial<CabinetPipelineStats>,
): CabinetPipelineStats {
  return {
    triggeredAt,
    completedAt: new Date().toISOString(),
    rssItemsFound: partial.rssItemsFound ?? 0,
    cabinetItemsFiltered: partial.cabinetItemsFiltered ?? 0,
    articlesCrawled: partial.articlesCrawled ?? 0,
    agendasStructured: partial.agendasStructured ?? 0,
    agendasStored: partial.agendasStored ?? 0,
    issuesMapped: partial.issuesMapped ?? 0,
  };
}
