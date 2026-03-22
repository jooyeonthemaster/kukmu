import { task, logger } from "@trigger.dev/sdk/v3";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NecCandidate {
  sgId: string;
  sgTypecode: string;
  sggName: string;
  sdName: string;
  wiwName: string;
  giho: string;
  jdName: string;
  name: string;
  hanjaName: string;
  gender: string;
  birthday: string;
  age: string;
  addr: string;
  jobId: string;
  job: string;
  eduId: string;
  edu: string;
  career1: string;
  career2: string;
  status: string;
}

export interface NecPledge {
  sgId: string;
  sgTypecode: string;
  sggName: string;
  sdName: string;
  wiwName: string;
  giho: string;
  jdName: string;
  name: string;
  prmsRealmName: string;
  prmsTitle: string;
  prmmCont: string;
}

interface CrawlNecCandidatesPayload {
  /** Election ID, e.g. "20260603" for the 2026 local election */
  sgId: string;
  /** Election type code. 2=광역단체장, 3=기초단체장, etc. */
  sgTypecode: string;
  /** Optional: city/province name filter */
  sdName?: string;
  /** Number of rows per page. Defaults to 100. */
  numOfRows?: number;
}

interface CrawlNecPledgesPayload {
  sgId: string;
  sgTypecode: string;
  sdName?: string;
  numOfRows?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANDIDATE_API_BASE =
  "http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPofelcddInfoInqire";
const PLEDGE_API_BASE =
  "http://apis.data.go.kr/9760000/ElecPrmsInfoInqireService/getElecPrmsInfoInqire";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => {
    // Force items to always be arrays even when there is only one
    return name === "item";
  },
  trimValues: true,
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDataGoKrXml(
  baseUrl: string,
  params: Record<string, string>,
  label: string,
): Promise<unknown | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DATA_GO_KR_API_KEY environment variable");
  }

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const searchParams = new URLSearchParams({
        serviceKey: apiKey,
        ...params,
      });

      const url = `${baseUrl}?${searchParams.toString()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        headers: {
          Accept: "application/xml",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.warn(`data.go.kr ${label} HTTP ${response.status}`, {
          attempt,
          body: body.slice(0, 500),
        });
        if (attempt === maxRetries) return null;
        await delay(attempt * 2000);
        continue;
      }

      const xmlText = await response.text();

      // Parse XML
      const parsed = xmlParser.parse(xmlText);

      // Check for API-level errors
      const resultCode =
        parsed?.response?.header?.resultCode ??
        parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;

      if (resultCode && resultCode !== "00" && resultCode !== "0") {
        const resultMsg =
          parsed?.response?.header?.resultMsg ??
          parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ??
          "Unknown API error";
        logger.warn(`data.go.kr ${label} API error`, {
          resultCode,
          resultMsg,
          attempt,
        });
        if (attempt === maxRetries) return null;
        await delay(attempt * 2000);
        continue;
      }

      return parsed;
    } catch (error) {
      logger.warn(`data.go.kr ${label} attempt ${attempt} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxRetries) return null;
      await delay(attempt * 2000);
    }
  }

  return null;
}

function extractItems(parsed: unknown): unknown[] {
  const response = (parsed as Record<string, unknown>)?.response as
    | Record<string, unknown>
    | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const items = body?.items as Record<string, unknown> | undefined;
  const itemList = items?.item;

  if (Array.isArray(itemList)) return itemList;
  if (itemList) return [itemList];
  return [];
}

function safeString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function mapCandidate(raw: Record<string, unknown>): NecCandidate {
  return {
    sgId: safeString(raw.sgId),
    sgTypecode: safeString(raw.sgTypecode),
    sggName: safeString(raw.sggName),
    sdName: safeString(raw.sdName),
    wiwName: safeString(raw.wiwName),
    giho: safeString(raw.giho),
    jdName: safeString(raw.jdName),
    name: safeString(raw.name),
    hanjaName: safeString(raw.hanjaName),
    gender: safeString(raw.gender),
    birthday: safeString(raw.birthday),
    age: safeString(raw.age),
    addr: safeString(raw.addr),
    jobId: safeString(raw.jobId),
    job: safeString(raw.job),
    eduId: safeString(raw.eduId),
    edu: safeString(raw.edu),
    career1: safeString(raw.career1),
    career2: safeString(raw.career2),
    status: safeString(raw.status),
  };
}

function mapPledge(raw: Record<string, unknown>): NecPledge {
  return {
    sgId: safeString(raw.sgId),
    sgTypecode: safeString(raw.sgTypecode),
    sggName: safeString(raw.sggName),
    sdName: safeString(raw.sdName),
    wiwName: safeString(raw.wiwName),
    giho: safeString(raw.giho),
    jdName: safeString(raw.jdName),
    name: safeString(raw.name),
    prmsRealmName: safeString(raw.prmsRealmName),
    prmsTitle: safeString(raw.prmsTitle),
    prmmCont: safeString(raw.prmmCont),
  };
}

// ---------------------------------------------------------------------------
// Task: crawl-nec-candidates
// ---------------------------------------------------------------------------

export const crawlNecCandidates = task({
  id: "crawl-nec-candidates",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: CrawlNecCandidatesPayload): Promise<NecCandidate[]> => {
    const { sgId, sgTypecode, sdName, numOfRows = 100 } = payload;

    logger.info("Starting NEC candidate crawl", {
      sgId,
      sgTypecode,
      sdName,
    });

    const allCandidates: NecCandidate[] = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, string> = {
        sgId,
        sgTypecode,
        numOfRows: String(numOfRows),
        pageNo: String(pageNo),
        resultType: "xml",
      };

      if (sdName) {
        params.sdName = sdName;
      }

      const parsed = await fetchDataGoKrXml(
        CANDIDATE_API_BASE,
        params,
        `candidates page ${pageNo}`,
      );

      if (!parsed) {
        logger.warn("Failed to fetch candidate page, stopping pagination", {
          pageNo,
        });
        break;
      }

      const items = extractItems(parsed);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        allCandidates.push(mapCandidate(item as Record<string, unknown>));
      }

      logger.info(`Candidate page ${pageNo}: ${items.length} items`);

      if (items.length < numOfRows) {
        hasMore = false;
      } else {
        pageNo++;
        await delay(500); // Rate limit
      }
    }

    logger.info("NEC candidate crawl complete", {
      totalCandidates: allCandidates.length,
      pages: pageNo,
    });

    return allCandidates;
  },
});

// ---------------------------------------------------------------------------
// Task: crawl-nec-pledges
// ---------------------------------------------------------------------------

export const crawlNecPledges = task({
  id: "crawl-nec-pledges",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: CrawlNecPledgesPayload): Promise<NecPledge[]> => {
    const { sgId, sgTypecode, sdName, numOfRows = 100 } = payload;

    logger.info("Starting NEC pledge crawl", {
      sgId,
      sgTypecode,
      sdName,
    });

    const allPledges: NecPledge[] = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, string> = {
        sgId,
        sgTypecode,
        numOfRows: String(numOfRows),
        pageNo: String(pageNo),
        resultType: "xml",
      };

      if (sdName) {
        params.sdName = sdName;
      }

      const parsed = await fetchDataGoKrXml(
        PLEDGE_API_BASE,
        params,
        `pledges page ${pageNo}`,
      );

      if (!parsed) {
        logger.warn("Failed to fetch pledge page, stopping pagination", {
          pageNo,
        });
        break;
      }

      const items = extractItems(parsed);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        allPledges.push(mapPledge(item as Record<string, unknown>));
      }

      logger.info(`Pledge page ${pageNo}: ${items.length} items`);

      if (items.length < numOfRows) {
        hasMore = false;
      } else {
        pageNo++;
        await delay(500);
      }
    }

    logger.info("NEC pledge crawl complete", {
      totalPledges: allPledges.length,
      pages: pageNo,
    });

    return allPledges;
  },
});
