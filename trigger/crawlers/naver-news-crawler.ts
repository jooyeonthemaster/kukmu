import { task, logger } from "@trigger.dev/sdk/v3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsApiResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

export interface NormalizedNewsArticle {
  source: "naver";
  sourceId: string;
  url: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string;
}

interface CrawlNaverNewsPayload {
  keywords: string[];
  /** Max results per keyword. Defaults to 100. */
  maxPerKeyword?: number;
  /** Whether to paginate beyond the first page. Defaults to false. */
  paginate?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAVER_API_BASE = "https://openapi.naver.com/v1/search/news.json";
const MAX_START = 1000; // Naver API hard limit
const PAGE_SIZE = 100;

function stripHtmlTags(html: string): string {
  return html
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractPublisher(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function generateSourceId(item: NaverNewsItem): string {
  const url = item.originallink || item.link;
  // Create a deterministic ID from the URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return `naver-${Math.abs(hash).toString(36)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNaverNewsPage(
  keyword: string,
  start: number,
  clientId: string,
  clientSecret: string,
): Promise<NaverNewsApiResponse | null> {
  const params = new URLSearchParams({
    query: keyword,
    display: String(PAGE_SIZE),
    start: String(start),
    sort: "date",
  });

  const url = `${NAVER_API_BASE}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(`Naver News API returned HTTP ${response.status}`, {
        keyword,
        start,
        body: body.slice(0, 300),
      });
      return null;
    }

    return (await response.json()) as NaverNewsApiResponse;
  } catch (error) {
    logger.warn("Naver News API fetch failed", {
      keyword,
      start,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task: crawl-naver-news
// ---------------------------------------------------------------------------

export const crawlNaverNews = task({
  id: "crawl-naver-news",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (
    payload: CrawlNaverNewsPayload,
  ): Promise<NormalizedNewsArticle[]> => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET environment variables",
      );
    }

    const { keywords, maxPerKeyword = 100, paginate = false } = payload;

    if (!keywords || keywords.length === 0) {
      logger.warn("No keywords provided to crawl-naver-news");
      return [];
    }

    logger.info("Starting Naver News crawl", {
      keywordCount: keywords.length,
      maxPerKeyword,
      paginate,
    });

    const allArticles: NormalizedNewsArticle[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      let collected = 0;
      let start = 1;

      while (start <= MAX_START && collected < maxPerKeyword) {
        const data = await fetchNaverNewsPage(
          keyword,
          start,
          clientId,
          clientSecret,
        );

        if (!data || !data.items || data.items.length === 0) {
          break;
        }

        for (const item of data.items) {
          const url = item.originallink || item.link;

          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const article: NormalizedNewsArticle = {
            source: "naver",
            sourceId: generateSourceId(item),
            url,
            title: stripHtmlTags(item.title),
            summary: stripHtmlTags(item.description),
            publisher: extractPublisher(url),
            publishedAt: new Date(item.pubDate).toISOString(),
          };

          allArticles.push(article);
          collected++;
        }

        if (!paginate) break;
        if (data.items.length < PAGE_SIZE) break;

        start += PAGE_SIZE;

        // Rate limit: Naver API allows ~25 req/sec but be respectful
        await delay(200);
      }

      logger.info(`Keyword "${keyword}" collected ${collected} articles`);

      // Small delay between keywords to avoid rate limiting
      await delay(300);
    }

    logger.info("Naver News crawl complete", {
      totalArticles: allArticles.length,
      uniqueUrls: seenUrls.size,
    });

    return allArticles;
  },
});
