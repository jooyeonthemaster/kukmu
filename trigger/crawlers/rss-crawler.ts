import { task, logger } from "@trigger.dev/sdk/v3";
import RssParser from "rss-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RssFeedInput {
  name: string;
  url: string;
}

export interface RssArticle {
  source: string;
  feedName: string;
  url: string;
  title: string;
  summary: string;
  author: string;
  publishedAt: string;
  categories: string[];
}

interface CrawlRssFeedsPayload {
  feeds: RssFeedInput[];
  /** Only include items published within the last N hours. Defaults to 24. */
  hoursBack: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ---------------------------------------------------------------------------
// Task: crawl-rss-feeds
// ---------------------------------------------------------------------------

export const crawlRssFeeds = task({
  id: "crawl-rss-feeds",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: CrawlRssFeedsPayload): Promise<RssArticle[]> => {
    const { feeds, hoursBack = 24 } = payload;

    if (!feeds || feeds.length === 0) {
      logger.warn("No feeds provided to crawl-rss-feeds");
      return [];
    }

    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    logger.info("Starting RSS feed crawl", {
      feedCount: feeds.length,
      hoursBack,
      cutoff: cutoff.toISOString(),
    });

    const parser = new RssParser({
      timeout: 15_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KukmuBot/1.0; +https://kukmu.kr)",
        Accept:
          "application/rss+xml, application/xml, text/xml, application/atom+xml",
      },
      customFields: {
        item: [
          ["dc:creator", "creator"],
          ["content:encoded", "contentEncoded"],
          ["media:content", "mediaContent"],
        ],
      },
    });

    const allArticles: RssArticle[] = [];
    const feedResults: Array<{ name: string; count: number; error?: string }> =
      [];

    // Process feeds concurrently in batches of 5 to avoid overwhelming
    const BATCH_SIZE = 5;

    for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
      const batch = feeds.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (feed) => {
          try {
            const parsed = await parser.parseURL(feed.url);
            const articles: RssArticle[] = [];

            for (const item of parsed.items ?? []) {
              // Parse publication date
              const pubDateStr =
                item.pubDate ?? item.isoDate ?? (item as any).date ?? "";
              let publishedAt: Date;

              try {
                publishedAt = new Date(pubDateStr);
                if (isNaN(publishedAt.getTime())) {
                  // Skip items with unparseable dates
                  continue;
                }
              } catch {
                continue;
              }

              // Filter by time window
              if (publishedAt < cutoff) continue;

              const title = stripHtml(item.title);
              const summary = truncate(
                stripHtml(
                  item.contentSnippet ??
                    item.content ??
                    (item as unknown as Record<string, string>).contentEncoded ??
                    item.summary ??
                    "",
                ),
                1000,
              );

              const url = item.link ?? item.guid ?? "";
              if (!url) continue;

              const author = stripHtml(
                item.creator ??
                  (item as unknown as Record<string, string>).creator ??
                  (item as any).author ??
                  "",
              );

              const categories = (item.categories ?? []).map((c: string | Record<string, string>) =>
                typeof c === "string" ? c : c?._ ?? String(c),
              );

              articles.push({
                source: "rss",
                feedName: feed.name,
                url,
                title,
                summary,
                author,
                publishedAt: publishedAt.toISOString(),
                categories,
              });
            }

            feedResults.push({ name: feed.name, count: articles.length });
            return articles;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            logger.warn(`RSS feed "${feed.name}" failed`, {
              url: feed.url,
              error: errorMsg,
            });
            feedResults.push({ name: feed.name, count: 0, error: errorMsg });
            return [];
          }
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          allArticles.push(...result.value);
        }
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = allArticles.filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    });

    // Sort by publishedAt descending (newest first)
    deduped.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    logger.info("RSS feed crawl complete", {
      totalArticles: deduped.length,
      feedResults,
      successfulFeeds: feedResults.filter((f) => !f.error).length,
      failedFeeds: feedResults.filter((f) => f.error).length,
    });

    return deduped;
  },
});
