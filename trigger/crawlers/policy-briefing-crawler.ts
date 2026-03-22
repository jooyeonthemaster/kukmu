import { task, logger } from "@trigger.dev/sdk/v3";
import RssParser from "rss-parser";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyBriefingAgendaItem {
  number: string;
  title: string;
  department: string;
  description: string;
}

export interface PolicyBriefingArticle {
  source: "korea-kr";
  url: string;
  title: string;
  publishedAt: string;
  summary: string;
  isKabinet: boolean;
  agendaItems: PolicyBriefingAgendaItem[];
  fullText: string;
}

interface CrawlPolicyBriefingPayload {
  /** Only include items published within the last N hours. Defaults to 72. */
  hoursBack?: number;
  /** Max number of articles to fetch full content for. Defaults to 20. */
  maxDetailFetch?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KOREA_KR_RSS = "https://www.korea.kr/rss/policy.xml";

const KABINET_KEYWORDS = [
  "국무회의",
  "국무총리",
  "국무위원",
  "각의",
  "차관회의",
  "국정현안",
  "안건",
];

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKabinetRelated(text: string): boolean {
  const lowerText = text.toLowerCase();
  return KABINET_KEYWORDS.some((kw) => lowerText.includes(kw));
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchArticlePage(url: string): Promise<string | null> {
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);

      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`korea.kr article fetch HTTP ${response.status}`, {
          url,
          attempt,
        });
        if (attempt === maxRetries) return null;
        await delay(attempt * 2000);
        continue;
      }

      return await response.text();
    } catch (error) {
      logger.warn(`korea.kr article fetch failed`, {
        url,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxRetries) return null;
      await delay(attempt * 2000);
    }
  }

  return null;
}

function extractAgendaItems(
  $: cheerio.CheerioAPI,
): PolicyBriefingAgendaItem[] {
  const items: PolicyBriefingAgendaItem[] = [];

  // Strategy 1: Look for numbered list items in the article body
  // Korean government 국무회의 articles typically list agenda items as
  // numbered entries like "1. 안건명 (소관부처)"
  const bodyText =
    $(".view_con, .article_view, .bbs_contents, #article_body, .view_cont")
      .text() ?? "";

  // Match patterns like:
  // "1. 제목 (부처)"  or  "□ 제목"  or  "○ 제목"
  const numberedPattern =
    /(?:(\d+)\.\s*|[□○●■▶►]\s*)([^\n(]+?)(?:\s*\(([^)]+)\))?\s*(?:\n|$)/g;
  let match;

  while ((match = numberedPattern.exec(bodyText)) !== null) {
    const number = match[1] ?? "";
    const title = cleanText(match[2]);
    const department = cleanText(match[3] ?? "");

    if (title.length > 2 && title.length < 200) {
      items.push({
        number,
        title,
        department,
        description: "",
      });
    }
  }

  // Strategy 2: Look for agenda items in tables
  if (items.length === 0) {
    $("table").each((_tableIdx, table) => {
      const rows = $(table).find("tr");
      rows.each((_rowIdx, row) => {
        const cells = $(row)
          .find("td, th")
          .map((_i, el) => cleanText($(el).text()))
          .get();

        if (cells.length >= 2) {
          // Check if first cell looks like a number
          const numMatch = cells[0].match(/^\d+$/);
          if (numMatch) {
            items.push({
              number: cells[0],
              title: cells[1],
              department: cells[2] ?? "",
              description: cells.slice(3).join(" "),
            });
          }
        }
      });
    });
  }

  // Strategy 3: Look for <li> items within ordered lists
  if (items.length === 0) {
    $(
      ".view_con ol li, .article_view ol li, .bbs_contents ol li",
    ).each((_i, li) => {
      const text = cleanText($(li).text());
      if (text.length > 2) {
        const departmentMatch = text.match(/\(([^)]+)\)\s*$/);
        items.push({
          number: String(_i + 1),
          title: departmentMatch
            ? text.replace(departmentMatch[0], "").trim()
            : text,
          department: departmentMatch ? departmentMatch[1] : "",
          description: "",
        });
      }
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Task: crawl-policy-briefing
// ---------------------------------------------------------------------------

export const crawlPolicyBriefing = task({
  id: "crawl-policy-briefing",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (
    payload: CrawlPolicyBriefingPayload,
  ): Promise<PolicyBriefingArticle[]> => {
    const { hoursBack = 72, maxDetailFetch = 20 } = payload;

    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    logger.info("Starting policy briefing crawl", {
      hoursBack,
      cutoff: cutoff.toISOString(),
      maxDetailFetch,
    });

    // Step 1: Fetch and parse the RSS feed
    const parser = new RssParser({
      timeout: 15_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KukmuBot/1.0; +https://kukmu.kr)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    let feed;
    try {
      feed = await parser.parseURL(KOREA_KR_RSS);
    } catch (error) {
      logger.error("Failed to parse korea.kr RSS feed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }

    if (!feed.items || feed.items.length === 0) {
      logger.warn("No items found in korea.kr RSS feed");
      return [];
    }

    logger.info(`Fetched ${feed.items.length} items from korea.kr RSS`);

    // Step 2: Filter for 국무회의-related items within the time window
    const kabinetItems = feed.items.filter((item) => {
      const pubDate = new Date(
        item.pubDate ?? item.isoDate ?? item.date ?? "",
      );
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) return false;

      const text = `${item.title ?? ""} ${item.contentSnippet ?? ""} ${item.content ?? ""}`;
      return isKabinetRelated(text);
    });

    logger.info(
      `Found ${kabinetItems.length} 국무회의-related items after filtering`,
    );

    // Step 3: Fetch full article pages and extract structured data
    const articles: PolicyBriefingArticle[] = [];
    const itemsToFetch = kabinetItems.slice(0, maxDetailFetch);

    for (const item of itemsToFetch) {
      const url = item.link ?? item.guid ?? "";
      if (!url) continue;

      const publishedAt = new Date(
        item.pubDate ?? item.isoDate ?? item.date ?? "",
      ).toISOString();

      const title = stripHtml(item.title);
      const summary = stripHtml(item.contentSnippet ?? item.content ?? "");

      // Fetch the full article page
      const html = await fetchArticlePage(url);

      let agendaItems: PolicyBriefingAgendaItem[] = [];
      let fullText = summary;

      if (html) {
        const $ = cheerio.load(html);

        // Extract the article body text
        const bodySelector =
          ".view_con, .article_view, .bbs_contents, #article_body, .view_cont";
        const bodyEl = $(bodySelector).first();
        if (bodyEl.length) {
          fullText = cleanText(bodyEl.text());
        }

        // Extract structured agenda items
        agendaItems = extractAgendaItems($);
      }

      articles.push({
        source: "korea-kr",
        url,
        title,
        publishedAt,
        summary,
        isKabinet: true,
        agendaItems,
        fullText: fullText.slice(0, 10_000), // Cap at 10k chars
      });

      // Polite delay between page fetches
      await delay(1000);
    }

    logger.info("Policy briefing crawl complete", {
      totalArticles: articles.length,
      totalAgendaItems: articles.reduce(
        (sum, a) => sum + a.agendaItems.length,
        0,
      ),
    });

    return articles;
  },
});
