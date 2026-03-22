import { schedules, task, logger, batch } from "@trigger.dev/sdk/v3";
import {
  storeRawPolls,
  storePollResults,
  type RawPoll,
  type StructuredPollResult,
} from "../stores/poll-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NesdcListItem {
  nesdc_id: string;
  title: string;
  organization: string;
  date: string;
  url: string;
}

interface NesdcDetailResult {
  nesdc_id: string;
  title: string;
  organization: string;
  survey_period_start: string;
  survey_period_end: string;
  sample_size: number;
  margin_of_error: number;
  method: string;
  url: string;
  raw_html: string;
}

interface PollPipelineStats {
  triggeredAt: string;
  completedAt: string;
  listedCount: number;
  newPollCount: number;
  scrapedCount: number;
  storedRawCount: number;
  structuredCount: number;
  storedResultsCount: number;
}

// ---------------------------------------------------------------------------
// Schedule: every 30 minutes
// ---------------------------------------------------------------------------

export const pollPipelineSchedule = schedules.task({
  id: "poll-pipeline-cron",
  cron: { pattern: "*/30 * * * *", timezone: "Asia/Seoul" },
  run: async (payload) => {
    logger.info("Poll pipeline cron triggered", {
      timestamp: payload.timestamp.toISOString(),
    });

    const result = await pollPipelineOrchestrator.triggerAndWait({
      triggeredAt: payload.timestamp.toISOString(),
    });

    logger.info("Poll pipeline cron completed", { result });
    return result;
  },
});

// ---------------------------------------------------------------------------
// Orchestrator: poll-pipeline
// ---------------------------------------------------------------------------

export const pollPipelineOrchestrator = task({
  id: "poll-pipeline",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: {
    triggeredAt: string;
  }): Promise<PollPipelineStats> => {
    const startTime = Date.now();
    logger.info("Poll pipeline started", { triggeredAt: payload.triggeredAt });

    // ------------------------------------------------------------------
    // Step 1: Scrape NESDC list page
    // ------------------------------------------------------------------
    logger.info("Step 1: Scraping NESDC poll list");

    const listResult = await nesdcListScraper.triggerAndWait({
      maxPages: 3,
    });

    const listedPolls: NesdcListItem[] = listResult.ok
      ? listResult.output.polls
      : [];

    logger.info(`Step 1 complete: ${listedPolls.length} polls found on NESDC`);

    if (listedPolls.length === 0) {
      logger.info("No polls found, pipeline complete");
      return buildPollStats(payload.triggeredAt, {});
    }

    // ------------------------------------------------------------------
    // Step 2: Compare with existing IDs in DB
    // ------------------------------------------------------------------
    logger.info("Step 2: Checking for new polls");

    const existingCheckResult = await checkExistingPolls.triggerAndWait({
      nesdc_ids: listedPolls.map((p) => p.nesdc_id),
    });

    const existingIds = new Set(
      existingCheckResult.ok ? existingCheckResult.output.existing_ids : [],
    );

    const newPolls = listedPolls.filter((p) => !existingIds.has(p.nesdc_id));

    logger.info(
      `Step 2 complete: ${newPolls.length} new polls (${existingIds.size} already exist)`,
    );

    if (newPolls.length === 0) {
      logger.info("No new polls to process, pipeline complete");
      return buildPollStats(payload.triggeredAt, {
        listedCount: listedPolls.length,
      });
    }

    // ------------------------------------------------------------------
    // Step 3: Scrape detail pages for new polls (parallel)
    // ------------------------------------------------------------------
    logger.info("Step 3: Scraping poll detail pages");

    const detailPayloads = newPolls.map((p) => ({
      id: nesdcDetailScraper.id,
      payload: {
        nesdc_id: p.nesdc_id,
        title: p.title,
        organization: p.organization,
        url: p.url,
      },
    }));

    const detailResults = await batch.triggerAndWait<typeof nesdcDetailScraper>(
      detailPayloads,
    );

    const scrapedDetails: NesdcDetailResult[] = [];

    for (const result of detailResults.runs) {
      if (result.ok && result.output) {
        scrapedDetails.push(result.output);
      } else {
        logger.warn("Poll detail scrape failed", {
          error: result.ok ? "null output" : result.error,
        });
      }
    }

    logger.info(`Step 3 complete: ${scrapedDetails.length} detail pages scraped`);

    // ------------------------------------------------------------------
    // Step 4: Store raw polls
    // ------------------------------------------------------------------
    logger.info("Step 4: Storing raw polls");

    const rawPolls: RawPoll[] = scrapedDetails.map((d) => ({
      nesdc_id: d.nesdc_id,
      title: d.title,
      organization: d.organization,
      survey_period_start: d.survey_period_start,
      survey_period_end: d.survey_period_end,
      sample_size: d.sample_size,
      margin_of_error: d.margin_of_error,
      method: d.method,
      url: d.url,
      raw_html: d.raw_html,
      crawled_at: new Date().toISOString(),
    }));

    const storeRawResult = await storeRawPolls.triggerAndWait({ polls: rawPolls });
    const storedRawIds = storeRawResult.ok
      ? storeRawResult.output.newPollIds
      : [];

    logger.info(`Step 4 complete: ${storedRawIds.length} raw polls stored`);

    // ------------------------------------------------------------------
    // Step 5: Claude structures poll results
    // ------------------------------------------------------------------
    logger.info("Step 5: Structuring poll data with Claude");

    const structureBatch = scrapedDetails.map((d) => ({
      id: claudeStructurePoll.id,
      payload: {
        nesdc_id: d.nesdc_id,
        title: d.title,
        organization: d.organization,
        raw_html: d.raw_html,
        survey_period_start: d.survey_period_start,
        survey_period_end: d.survey_period_end,
        sample_size: d.sample_size,
        margin_of_error: d.margin_of_error,
      },
    }));

    const structureResults = await batch.triggerAndWait<typeof claudeStructurePoll>(
      structureBatch,
    );

    const structuredPolls: StructuredPollResult[] = [];

    for (const result of structureResults.runs) {
      if (result.ok && result.output) {
        structuredPolls.push(...(result.output.results ?? []));
      }
    }

    logger.info(`Step 5 complete: ${structuredPolls.length} poll results structured`);

    // ------------------------------------------------------------------
    // Step 6: Store structured polls + poll_results
    // ------------------------------------------------------------------
    logger.info("Step 6: Storing structured poll results");

    const storeStructuredResult = await storePollResults.triggerAndWait({
      results: structuredPolls,
    });

    const storedResultsCount = storeStructuredResult.ok
      ? storeStructuredResult.output.storedCount
      : 0;

    logger.info(`Step 6 complete: ${storedResultsCount} poll results stored`);

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------
    const stats: PollPipelineStats = {
      triggeredAt: payload.triggeredAt,
      completedAt: new Date().toISOString(),
      listedCount: listedPolls.length,
      newPollCount: newPolls.length,
      scrapedCount: scrapedDetails.length,
      storedRawCount: storedRawIds.length,
      structuredCount: structuredPolls.length,
      storedResultsCount,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Poll pipeline complete in ${elapsed}s`, { stats });

    return stats;
  },
});

// ---------------------------------------------------------------------------
// Sub-tasks
// ---------------------------------------------------------------------------

export const nesdcListScraper = task({
  id: "nesdc-list-scraper",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: { maxPages: number }) => {
    const { maxPages } = payload;
    logger.info("NESDC list scraper started", { maxPages });

    const cheerio = await import("cheerio");
    const polls: NesdcListItem[] = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = `https://www.nesdc.go.kr/portal/bbs/B0000005/list.do?menuNo=200467&pageIndex=${page}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          logger.warn(`NESDC list page ${page} returned ${response.status}`);
          break;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Parse list table rows
        $("table.bbs-list tbody tr").each((_idx, el) => {
          const $row = $(el);
          const $link = $row.find("td.subject a");
          const href = $link.attr("href") ?? "";
          const title = $link.text().trim();
          const organization = $row.find("td:nth-child(3)").text().trim();
          const date = $row.find("td:nth-child(4)").text().trim();

          // Extract nesdc_id from href
          const idMatch = href.match(/nttId=(\d+)/);
          if (idMatch && title) {
            // Filter for election-related polls
            const isElectionRelated =
              title.includes("지방선거") ||
              title.includes("시장") ||
              title.includes("도지사") ||
              title.includes("지지율") ||
              title.includes("광역단체장") ||
              title.includes("기초단체장");

            if (isElectionRelated) {
              polls.push({
                nesdc_id: idMatch[1],
                title,
                organization,
                date,
                url: `https://www.nesdc.go.kr${href}`,
              });
            }
          }
        });

        logger.info(`NESDC list page ${page} parsed`, {
          pollsFoundSoFar: polls.length,
        });
      } catch (err) {
        logger.error(`NESDC list page ${page} scrape failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    logger.info(`NESDC list scraper complete: ${polls.length} election polls found`);
    return { polls };
  },
});

export const nesdcDetailScraper = task({
  id: "nesdc-detail-scraper",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    nesdc_id: string;
    title: string;
    organization: string;
    url: string;
  }): Promise<NesdcDetailResult> => {
    const { nesdc_id, title, organization, url } = payload;
    logger.info(`Scraping NESDC detail page ${nesdc_id}`);

    const cheerio = await import("cheerio");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NESDC detail page ${nesdc_id} returned ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract metadata from detail page
    const infoTable = $("table.bbs-view");
    const getText = (label: string): string => {
      let text = "";
      infoTable.find("th").each((_i, th) => {
        if ($(th).text().trim().includes(label)) {
          text = $(th).next("td").text().trim();
        }
      });
      return text;
    };

    const surveyPeriod = getText("조사기간");
    const sampleSizeText = getText("표본크기") || getText("표본수");
    const marginText = getText("오차범위") || getText("오차한계");
    const method = getText("조사방법") || getText("조사방식");

    // Parse survey period (e.g., "2026.05.01 ~ 2026.05.03")
    const periodMatch = surveyPeriod.match(
      /(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[~\-]\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/,
    );
    const surveyStart = periodMatch
      ? periodMatch[1].replace(/\./g, "-")
      : new Date().toISOString().split("T")[0];
    const surveyEnd = periodMatch
      ? periodMatch[2].replace(/\./g, "-")
      : surveyStart;

    // Parse sample size
    const sampleMatch = sampleSizeText.match(/[\d,]+/);
    const sampleSize = sampleMatch
      ? parseInt(sampleMatch[0].replace(/,/g, ""), 10)
      : 0;

    // Parse margin of error
    const marginMatch = marginText.match(/[\d.]+/);
    const marginOfError = marginMatch ? parseFloat(marginMatch[0]) : 0;

    // Get the poll content HTML
    const contentHtml = $(".bbs-view-content, .view_cont, #divViewConts")
      .html() ?? "";

    logger.info(`NESDC detail ${nesdc_id} scraped`, {
      surveyPeriod: `${surveyStart} ~ ${surveyEnd}`,
      sampleSize,
      marginOfError,
    });

    return {
      nesdc_id,
      title,
      organization,
      survey_period_start: surveyStart,
      survey_period_end: surveyEnd,
      sample_size: sampleSize,
      margin_of_error: marginOfError,
      method,
      url,
      raw_html: contentHtml,
    };
  },
});

export const checkExistingPolls = task({
  id: "check-existing-polls",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000 },
  run: async (payload: { nesdc_ids: string[] }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from("raw_polls")
      .select("nesdc_id")
      .in("nesdc_id", payload.nesdc_ids);

    if (error) {
      logger.error("Failed to check existing polls", { error: error.message });
      throw new Error(`Supabase error: ${error.message}`);
    }

    const existing_ids = (data ?? []).map((r) => r.nesdc_id);
    logger.info(`Found ${existing_ids.length} existing polls in DB`);

    return { existing_ids };
  },
});

export const claudeStructurePoll = task({
  id: "claude-structure-poll",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async (payload: {
    nesdc_id: string;
    title: string;
    organization: string;
    raw_html: string;
    survey_period_start: string;
    survey_period_end: string;
    sample_size: number;
    margin_of_error: number;
  }): Promise<{ results: StructuredPollResult[] }> => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const {
      nesdc_id,
      title,
      organization,
      raw_html,
      survey_period_start,
      survey_period_end,
      sample_size,
      margin_of_error,
    } = payload;

    logger.info(`Structuring poll ${nesdc_id} with Claude`);

    // Strip HTML tags for cleaner input
    const textContent = raw_html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    const prompt = `다음 여론조사 데이터를 분석하여 구조화된 JSON으로 변환하세요.

여론조사 정보:
- 제목: ${title}
- 조사기관: ${organization}
- 조사기간: ${survey_period_start} ~ ${survey_period_end}
- 표본크기: ${sample_size}
- 오차범위: ${margin_of_error}%

여론조사 내용:
${textContent}

각 지역별 여론조사 결과를 다음 JSON 형식으로 반환하세요:
{
  "results": [
    {
      "province_code": "seoul|busan|daegu|incheon|gwangju|daejeon|ulsan|sejong|gyeonggi|gangwon|chungbuk|chungnam|jeonbuk|jeonnam|gyeongbuk|gyeongnam|jeju",
      "province_name": "서울특별시",
      "candidates": [
        {
          "name": "후보명",
          "party": "정당명",
          "percentage": 45.2,
          "is_leading": true
        }
      ]
    }
  ]
}

규칙:
1. 모든 지역의 후보를 포함하세요
2. percentage는 소수점 1자리까지
3. is_leading은 해당 지역에서 1위인 후보만 true
4. province_code는 영문 소문자 코드를 사용
5. 무응답/모름은 제외

JSON만 반환하세요.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: { results: Array<{ province_code: string; province_name: string; candidates: Array<{ name: string; party: string; percentage: number; is_leading: boolean }> }> };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      logger.error("Failed to parse Claude poll structure response", {
        nesdc_id,
        text: text.slice(0, 500),
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return { results: [] };
    }

    // Map to StructuredPollResult format
    const structuredResults: StructuredPollResult[] = (
      parsed.results ?? []
    ).map((r) => ({
      poll_nesdc_id: nesdc_id,
      province_code: r.province_code,
      province_name: r.province_name,
      poll_date: survey_period_end,
      source: organization,
      sample_size,
      margin_of_error,
      candidates: r.candidates.map((c) => ({
        name: c.name,
        party: c.party,
        percentage: c.percentage,
        is_leading: c.is_leading,
      })),
    }));

    logger.info(`Poll ${nesdc_id} structured: ${structuredResults.length} province results`);

    return { results: structuredResults };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPollStats(
  triggeredAt: string,
  partial: Partial<PollPipelineStats>,
): PollPipelineStats {
  return {
    triggeredAt,
    completedAt: new Date().toISOString(),
    listedCount: partial.listedCount ?? 0,
    newPollCount: partial.newPollCount ?? 0,
    scrapedCount: partial.scrapedCount ?? 0,
    storedRawCount: partial.storedRawCount ?? 0,
    structuredCount: partial.structuredCount ?? 0,
    storedResultsCount: partial.storedResultsCount ?? 0,
  };
}
