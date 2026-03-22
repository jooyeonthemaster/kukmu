import { task, logger } from "@trigger.dev/sdk/v3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommunityPost {
  source: "naver-blog" | "naver-cafe";
  sourceId: string;
  url: string;
  title: string;
  body: string;
  author: string;
  publishedAt: string;
}

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  bloggername?: string;
  bloggerlink?: string;
  postdate?: string;
  cafename?: string;
  cafeurl?: string;
}

interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

interface CrawlNaverBlogsPayload {
  keywords: string[];
  /** Max results per keyword. Defaults to 100. */
  maxPerKeyword?: number;
  /** Sort: sim (relevance) or date. Defaults to date. */
  sort?: "sim" | "date";
}

interface CrawlNaverCafesPayload {
  keywords: string[];
  maxPerKeyword?: number;
  sort?: "sim" | "date";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAVER_BLOG_API = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_CAFE_API =
  "https://openapi.naver.com/v1/search/cafearticle.json";
const PAGE_SIZE = 100;
const MAX_START = 1000;

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
    .replace(/\s+/g, " ")
    .trim();
}

function generateSourceId(prefix: string, url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert Naver's postdate format (yyyyMMdd) to ISO string.
 */
function parsePostDate(postdate: string | undefined): string {
  if (!postdate || postdate.length !== 8) {
    return new Date().toISOString();
  }
  const year = postdate.slice(0, 4);
  const month = postdate.slice(4, 6);
  const day = postdate.slice(6, 8);
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`).toISOString();
}

function getNaverCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET environment variables",
    );
  }

  return { clientId, clientSecret };
}

async function fetchNaverSearchPage(
  apiUrl: string,
  keyword: string,
  start: number,
  sort: string,
  clientId: string,
  clientSecret: string,
): Promise<NaverSearchResponse | null> {
  const params = new URLSearchParams({
    query: keyword,
    display: String(PAGE_SIZE),
    start: String(start),
    sort,
  });

  const url = `${apiUrl}?${params.toString()}`;

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
      logger.warn(`Naver Search API HTTP ${response.status}`, {
        apiUrl,
        keyword,
        start,
        body: body.slice(0, 300),
      });
      return null;
    }

    return (await response.json()) as NaverSearchResponse;
  } catch (error) {
    logger.warn("Naver Search API fetch failed", {
      apiUrl,
      keyword,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function crawlNaverSearch(
  apiUrl: string,
  source: "naver-blog" | "naver-cafe",
  keywords: string[],
  maxPerKeyword: number,
  sort: string,
): Promise<CommunityPost[]> {
  const { clientId, clientSecret } = getNaverCredentials();

  const allPosts: CommunityPost[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of keywords) {
    let collected = 0;
    let start = 1;

    while (start <= MAX_START && collected < maxPerKeyword) {
      const data = await fetchNaverSearchPage(
        apiUrl,
        keyword,
        start,
        sort,
        clientId,
        clientSecret,
      );

      if (!data || !data.items || data.items.length === 0) break;

      for (const item of data.items) {
        const url = item.link;
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);

        const post: CommunityPost = {
          source,
          sourceId: generateSourceId(source, url),
          url,
          title: stripHtmlTags(item.title),
          body: stripHtmlTags(item.description),
          author:
            source === "naver-blog"
              ? item.bloggername ?? ""
              : item.cafename ?? "",
          publishedAt: parsePostDate(item.postdate),
        };

        allPosts.push(post);
        collected++;
      }

      if (data.items.length < PAGE_SIZE) break;

      start += PAGE_SIZE;
      await delay(200);
    }

    logger.info(
      `${source} keyword "${keyword}" collected ${collected} posts`,
    );
    await delay(300);
  }

  return allPosts;
}

// ---------------------------------------------------------------------------
// Task: crawl-naver-blogs
// ---------------------------------------------------------------------------

export const crawlNaverBlogs = task({
  id: "crawl-naver-blogs",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: CrawlNaverBlogsPayload): Promise<CommunityPost[]> => {
    const {
      keywords,
      maxPerKeyword = 100,
      sort = "date",
    } = payload;

    if (!keywords || keywords.length === 0) {
      logger.warn("No keywords provided to crawl-naver-blogs");
      return [];
    }

    logger.info("Starting Naver Blog crawl", {
      keywordCount: keywords.length,
      maxPerKeyword,
      sort,
    });

    const posts = await crawlNaverSearch(
      NAVER_BLOG_API,
      "naver-blog",
      keywords,
      maxPerKeyword,
      sort,
    );

    logger.info("Naver Blog crawl complete", {
      totalPosts: posts.length,
    });

    return posts;
  },
});

// ---------------------------------------------------------------------------
// Task: crawl-naver-cafes
// ---------------------------------------------------------------------------

export const crawlNaverCafes = task({
  id: "crawl-naver-cafes",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: CrawlNaverCafesPayload): Promise<CommunityPost[]> => {
    const {
      keywords,
      maxPerKeyword = 100,
      sort = "date",
    } = payload;

    if (!keywords || keywords.length === 0) {
      logger.warn("No keywords provided to crawl-naver-cafes");
      return [];
    }

    logger.info("Starting Naver Cafe crawl", {
      keywordCount: keywords.length,
      maxPerKeyword,
      sort,
    });

    const posts = await crawlNaverSearch(
      NAVER_CAFE_API,
      "naver-cafe",
      keywords,
      maxPerKeyword,
      sort,
    );

    logger.info("Naver Cafe crawl complete", {
      totalPosts: posts.length,
    });

    return posts;
  },
});
