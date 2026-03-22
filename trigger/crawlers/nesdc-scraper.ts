import { task, logger } from "@trigger.dev/sdk/v3";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NesdcListItem {
  nttId: string;
  title: string;
  date: string;
}

export interface CandidateResult {
  name: string;
  party: string;
  percentage: number | null;
}

export interface NesdcPollDetail {
  nttId: string;
  title: string;
  electionType: string;
  region: string;
  pollster: string;
  commissioner: string;
  surveyStartDate: string;
  surveyEndDate: string;
  method: string;
  sampleSize: number | null;
  marginOfError: string;
  responseRate: string;
  candidates: CandidateResult[];
  rawTableData: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NESDC_LIST_URL =
  "https://www.nesdc.go.kr/portal/bbs/B0000005/list.do?menuNo=200467";
const NESDC_DETAIL_URL =
  "https://www.nesdc.go.kr/portal/bbs/B0000005/view.do";

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

async function fetchHtml(url: string): Promise<string | null> {
  const maxRetries = 3;

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
        logger.warn(`NESDC fetch HTTP ${response.status}`, { url, attempt });
        if (attempt === maxRetries) return null;
        await delay(attempt * 2000);
        continue;
      }

      const buffer = await response.arrayBuffer();
      // NESDC pages are encoded in EUC-KR or UTF-8
      // Try UTF-8 first, then EUC-KR
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder("euc-kr").decode(buffer);
      }

      return text;
    } catch (error) {
      logger.warn(`NESDC fetch attempt ${attempt} failed`, {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxRetries) return null;
      await delay(attempt * 2000);
    }
  }

  return null;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s명개]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Task 1: scrape-nesdc-list
// ---------------------------------------------------------------------------

export const scrapeNesdcList = task({
  id: "scrape-nesdc-list",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    pageIndex?: number;
  }): Promise<NesdcListItem[]> => {
    const pageIndex = payload.pageIndex ?? 1;
    const url = `${NESDC_LIST_URL}&pageIndex=${pageIndex}`;

    logger.info("Fetching NESDC poll list", { url, pageIndex });

    const html = await fetchHtml(url);
    if (!html) {
      logger.error("Failed to fetch NESDC list page");
      return [];
    }

    const $ = cheerio.load(html);
    const items: NesdcListItem[] = [];

    // The list page contains a table or list of registered polls
    // Each item has a link containing nttId parameter
    $("a[href*='nttId=']").each((_index, element) => {
      const href = $(element).attr("href") ?? "";
      const nttIdMatch = href.match(/nttId=(\d+)/);
      if (!nttIdMatch) return;

      const nttId = nttIdMatch[1];
      const title = cleanText($(element).text());

      // Try to find the date in a sibling or parent row
      const row = $(element).closest("tr");
      let date = "";
      if (row.length) {
        // Date is typically in one of the later <td> cells
        row.find("td").each((_i, td) => {
          const tdText = cleanText($(td).text());
          // Match date patterns like 2026-03-16 or 2026.03.16
          const dateMatch = tdText.match(
            /\d{4}[-./]\d{2}[-./]\d{2}/,
          );
          if (dateMatch && !date) {
            date = dateMatch[0].replace(/[./]/g, "-");
          }
        });
      }

      // Avoid duplicate nttIds
      if (!items.some((item) => item.nttId === nttId)) {
        items.push({ nttId, title, date });
      }
    });

    // Fallback: try list-style markup if table parsing found nothing
    if (items.length === 0) {
      $(".board_list li a, .bbs_list li a, .list_item a").each(
        (_index, element) => {
          const href = $(element).attr("href") ?? "";
          const nttIdMatch = href.match(/nttId=(\d+)/);
          if (!nttIdMatch) return;

          const nttId = nttIdMatch[1];
          const title = cleanText($(element).text());

          if (!items.some((item) => item.nttId === nttId)) {
            items.push({ nttId, title, date: "" });
          }
        },
      );
    }

    logger.info("NESDC list scrape complete", { itemCount: items.length });
    return items;
  },
});

// ---------------------------------------------------------------------------
// Task 2: scrape-nesdc-detail
// ---------------------------------------------------------------------------

export const scrapeNesdcDetail = task({
  id: "scrape-nesdc-detail",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { nttId: string }): Promise<NesdcPollDetail | null> => {
    const { nttId } = payload;
    const url = `${NESDC_DETAIL_URL}?nttId=${nttId}&menuNo=200467`;

    logger.info("Fetching NESDC poll detail", { nttId, url });

    const html = await fetchHtml(url);
    if (!html) {
      logger.error("Failed to fetch NESDC detail page", { nttId });
      return null;
    }

    const $ = cheerio.load(html);

    // Extract metadata from the info table
    // The detail page typically has a table with th/td pairs for metadata
    const rawTableData: Record<string, string> = {};

    $("table th").each((_index, th) => {
      const label = cleanText($(th).text());
      const value = cleanText(
        $(th).next("td").text() || $(th).closest("tr").find("td").first().text(),
      );
      if (label && value) {
        rawTableData[label] = value;
      }
    });

    // Also try dl/dt/dd format
    $("dt").each((_index, dt) => {
      const label = cleanText($(dt).text());
      const value = cleanText($(dt).next("dd").text());
      if (label && value) {
        rawTableData[label] = value;
      }
    });

    // Map Korean labels to fields
    const fieldMap: Record<string, string[]> = {
      electionType: ["선거종류", "선거구분", "선거명"],
      region: ["지역", "선거구", "시도"],
      pollster: ["여론조사기관", "조사기관"],
      commissioner: ["의뢰기관", "의뢰자"],
      surveyStartDate: ["조사시작일", "조사기간"],
      surveyEndDate: ["조사종료일"],
      method: ["조사방법", "조사방식"],
      sampleSize: ["표본크기", "응답자수", "표본수"],
      marginOfError: ["표본오차", "오차범위", "신뢰수준"],
      responseRate: ["응답률"],
    };

    function findField(keys: string[]): string {
      for (const key of keys) {
        for (const [label, value] of Object.entries(rawTableData)) {
          if (label.includes(key)) return value;
        }
      }
      return "";
    }

    // Parse candidate results from data tables
    const candidates: CandidateResult[] = [];

    // Look for result tables - typically the last table on the page
    // or a table with percentage values
    $("table").each((_tableIndex, table) => {
      const rows = $(table).find("tr");
      if (rows.length < 2) return;

      // Check if this table contains poll result data
      const headerRow = rows.first();
      const headers = headerRow
        .find("th, td")
        .map((_i, el) => cleanText($(el).text()))
        .get();

      const hasNameCol = headers.some(
        (h) =>
          h.includes("후보") ||
          h.includes("이름") ||
          h.includes("성명") ||
          h.includes("후보자"),
      );
      const hasPartyCol = headers.some(
        (h) => h.includes("정당") || h.includes("소속"),
      );
      const hasPercentCol = headers.some(
        (h) => h.includes("%") || h.includes("지지율") || h.includes("비율"),
      );

      if (!hasNameCol && !hasPercentCol) return;

      // Find column indices
      let nameIdx = headers.findIndex(
        (h) =>
          h.includes("후보") ||
          h.includes("이름") ||
          h.includes("성명") ||
          h.includes("후보자"),
      );
      let partyIdx = headers.findIndex(
        (h) => h.includes("정당") || h.includes("소속"),
      );
      let percentIdx = headers.findIndex(
        (h) => h.includes("%") || h.includes("지지율") || h.includes("비율"),
      );

      // Defaults if not found by header name
      if (nameIdx === -1) nameIdx = 0;
      if (percentIdx === -1) percentIdx = headers.length - 1;

      rows.slice(1).each((_rowIndex, row) => {
        const cells = $(row)
          .find("td")
          .map((_i, el) => cleanText($(el).text()))
          .get();

        if (cells.length < 2) return;

        const name = cells[nameIdx] ?? "";
        const party = partyIdx >= 0 ? cells[partyIdx] ?? "" : "";
        const percentText = cells[percentIdx] ?? "";
        const percentage = parseNumber(percentText.replace(/%/g, ""));

        if (name && name !== "-" && name !== "") {
          candidates.push({ name, party, percentage });
        }
      });
    });

    const surveyPeriod = findField(["조사시작일", "조사기간"]);
    let surveyStartDate = findField(["조사시작일"]);
    let surveyEndDate = findField(["조사종료일"]);

    // If dates come as a period string like "2026.03.10~2026.03.12"
    if (!surveyStartDate && surveyPeriod.includes("~")) {
      const parts = surveyPeriod.split("~").map((s) => s.trim());
      surveyStartDate = parts[0] ?? "";
      surveyEndDate = parts[1] ?? "";
    }

    const title = cleanText($("h2, h3, .view_title, .bbsV_title").first().text());

    const result: NesdcPollDetail = {
      nttId,
      title,
      electionType: findField(fieldMap.electionType),
      region: findField(fieldMap.region),
      pollster: findField(fieldMap.pollster),
      commissioner: findField(fieldMap.commissioner),
      surveyStartDate,
      surveyEndDate,
      method: findField(fieldMap.method),
      sampleSize: parseNumber(findField(fieldMap.sampleSize)),
      marginOfError: findField(fieldMap.marginOfError),
      responseRate: findField(fieldMap.responseRate),
      candidates,
      rawTableData,
    };

    logger.info("NESDC detail scrape complete", {
      nttId,
      title: result.title,
      candidateCount: candidates.length,
      fieldsFound: Object.values(rawTableData).filter(Boolean).length,
    });

    return result;
  },
});
