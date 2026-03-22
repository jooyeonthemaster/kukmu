import { schedules, task, logger, batch } from "@trigger.dev/sdk/v3";
import {
  upsertCandidates,
  type CandidateData,
} from "../stores/candidate-store";
import { PROVINCE_CODES } from "../constants";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NecCandidate {
  sgId: string;
  sggName: string;
  sdName: string;
  jdName: string;
  name: string;
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

interface NecPledge {
  sgId: string;
  sggName: string;
  sdName: string;
  name: string;
  prmsOrd: string;
  prmsRealmName: string;
  prmsTitle: string;
  prmmCont: string;
}

interface ElectionPipelineStats {
  triggeredAt: string;
  completedAt: string;
  candidatesFetched: number;
  pledgesFetched: number;
  newCandidates: number;
  updatedCandidates: number;
  changesDetected: ChangeLogEntry[];
}

interface ChangeLogEntry {
  type: "new_candidate" | "updated_pledges" | "status_change";
  province_code: string;
  candidate_name: string;
  party: string;
  details: string;
}

// Supabase client imported from shared lib

// ---------------------------------------------------------------------------
// Schedule: every 6 hours
// ---------------------------------------------------------------------------

export const electionPipelineSchedule = schedules.task({
  id: "election-pipeline-cron",
  cron: { pattern: "0 0,6,12,18 * * *", timezone: "Asia/Seoul" },
  run: async (payload) => {
    logger.info("Election pipeline cron triggered", {
      timestamp: payload.timestamp.toISOString(),
    });

    const result = await electionPipelineOrchestrator.triggerAndWait({
      triggeredAt: payload.timestamp.toISOString(),
    });

    logger.info("Election pipeline cron completed", { result });
    return result;
  },
});

// ---------------------------------------------------------------------------
// Orchestrator: election-pipeline
// ---------------------------------------------------------------------------

export const electionPipelineOrchestrator = task({
  id: "election-pipeline",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: {
    triggeredAt: string;
  }): Promise<ElectionPipelineStats> => {
    const startTime = Date.now();
    logger.info("Election pipeline started", {
      triggeredAt: payload.triggeredAt,
    });

    // ------------------------------------------------------------------
    // Step 1 + 2: Fetch candidates and pledges from NEC API (parallel)
    // ------------------------------------------------------------------
    logger.info("Steps 1-2: Fetching candidate and pledge data from NEC API");

    const [candidateResult, pledgeResult] = await Promise.all([
      necCandidateFetcher.triggerAndWait({
        electionId: "20260603",
        electionType: "2", // 지방선거 광역단체장
      }),
      necPledgeFetcher.triggerAndWait({
        electionId: "20260603",
        electionType: "2",
      }),
    ]);

    const necCandidates: NecCandidate[] = candidateResult.ok
      ? candidateResult.output.candidates
      : [];

    const necPledges: NecPledge[] = pledgeResult.ok
      ? pledgeResult.output.pledges
      : [];

    logger.info(
      `Steps 1-2 complete: ${necCandidates.length} candidates, ${necPledges.length} pledges fetched`,
    );

    // ------------------------------------------------------------------
    // Step 3: Build pledge map and upsert candidates
    // ------------------------------------------------------------------
    logger.info("Step 3: Upserting candidates");

    // Group pledges by candidate name + province
    const pledgeMap = new Map<string, string[]>();
    for (const pledge of necPledges) {
      const key = `${pledge.sdName}::${pledge.name}`;
      const existing = pledgeMap.get(key) ?? [];
      existing.push(
        `[${pledge.prmsRealmName}] ${pledge.prmsTitle}: ${pledge.prmmCont}`,
      );
      pledgeMap.set(key, existing);
    }

    // Map NEC candidates to our CandidateData format
    const candidateDataList: CandidateData[] = necCandidates.map((nc) => {
      const provinceCode = resolveProvinceCode(nc.sdName);
      const pledgeKey = `${nc.sdName}::${nc.name}`;
      const pledges = pledgeMap.get(pledgeKey) ?? [];

      const career = [nc.career1, nc.career2].filter(Boolean);

      return {
        province_code: provinceCode,
        name: nc.name,
        party: nc.jdName,
        age: nc.age ? parseInt(nc.age, 10) : null,
        incumbent: nc.status === "현직",
        career,
        pledges,
        image_url: null,
        registration_date: null,
        nec_candidate_id: nc.sgId ? `${nc.sgId}-${nc.name}` : null,
      };
    });

    const upsertResult = await upsertCandidates.triggerAndWait({
      candidates: candidateDataList,
    });

    const newCount = upsertResult.ok ? upsertResult.output.newCount : 0;
    const updatedCount = upsertResult.ok
      ? upsertResult.output.updatedCount
      : 0;

    logger.info(`Step 3 complete: ${newCount} new, ${updatedCount} updated`);

    // ------------------------------------------------------------------
    // Step 4: Detect changes
    // ------------------------------------------------------------------
    logger.info("Step 4: Detecting changes");

    const changes: ChangeLogEntry[] = [];

    // Fetch previous state for comparison (join provinces to get code)
    const { data: prevCandidates, error: prevError } = await supabase
      .from("candidates")
      .select("province_id, provinces(code), name, party, pledges, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (prevError) {
      logger.warn("Could not fetch previous candidates for diff", {
        error: prevError.message,
      });
    }

    const prevMap = new Map(
      (prevCandidates ?? []).map((c: any) => [
        `${c.provinces?.code ?? c.province_id}::${c.name}::${c.party}`,
        c,
      ]),
    );

    for (const cd of candidateDataList) {
      const key = `${cd.province_code}::${cd.name}::${cd.party}`;
      const prev = prevMap.get(key);

      if (!prev) {
        changes.push({
          type: "new_candidate",
          province_code: cd.province_code,
          candidate_name: cd.name,
          party: cd.party,
          details: `새로운 후보 등록: ${cd.name} (${cd.party}) - ${cd.province_code}`,
        });
      } else {
        // Check pledge changes
        const prevPledgeCount = (prev.pledges as string[] | null)?.length ?? 0;
        if (cd.pledges.length !== prevPledgeCount) {
          changes.push({
            type: "updated_pledges",
            province_code: cd.province_code,
            candidate_name: cd.name,
            party: cd.party,
            details: `공약 변경: ${prevPledgeCount}개 -> ${cd.pledges.length}개`,
          });
        }
      }
    }

    logger.info(`Step 4 complete: ${changes.length} changes detected`);

    // ------------------------------------------------------------------
    // Step 5: Log changes
    // ------------------------------------------------------------------
    logger.info("Step 5: Logging changes");

    if (changes.length > 0) {
      const changeRows = changes.map((c) => ({
        change_type: c.type,
        province_code: c.province_code,
        candidate_name: c.candidate_name,
        party: c.party,
        details: c.details,
        detected_at: new Date().toISOString(),
      }));

      const { error: logError } = await supabase
        .from("election_change_log")
        .insert(changeRows);

      if (logError) {
        // Non-fatal: table may not exist yet
        logger.warn("Failed to log election changes", {
          error: logError.message,
        });
      } else {
        logger.info(`${changes.length} changes logged to election_change_log`);
      }
    }

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------
    const stats: ElectionPipelineStats = {
      triggeredAt: payload.triggeredAt,
      completedAt: new Date().toISOString(),
      candidatesFetched: necCandidates.length,
      pledgesFetched: necPledges.length,
      newCandidates: newCount,
      updatedCandidates: updatedCount,
      changesDetected: changes,
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Election pipeline complete in ${elapsed}s`, { stats });

    return stats;
  },
});

// ---------------------------------------------------------------------------
// Sub-tasks
// ---------------------------------------------------------------------------

export const necCandidateFetcher = task({
  id: "nec-candidate-fetcher",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    electionId: string;
    electionType: string;
  }) => {
    const { electionId, electionType } = payload;
    logger.info("Fetching candidates from NEC API", { electionId, electionType });

    const NEC_API_KEY = process.env.NEC_API_KEY ?? "";

    if (!NEC_API_KEY) {
      logger.error("NEC_API_KEY is not set");
      return { candidates: [] };
    }

    const allCandidates: NecCandidate[] = [];
    let pageNo = 1;
    const pageSize = 100;

    while (true) {
      try {
        const params = new URLSearchParams({
          serviceKey: NEC_API_KEY,
          sgId: electionId,
          sgTypecode: electionType,
          pageNo: String(pageNo),
          numOfRows: String(pageSize),
          resultType: "json",
        });

        const url = `http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire?${params}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          logger.warn(`NEC candidate API returned ${response.status}`);
          break;
        }

        const data = await response.json();
        const items = data?.response?.body?.items?.item ?? [];
        const itemArray = Array.isArray(items) ? items : [items];

        if (itemArray.length === 0) break;

        for (const item of itemArray) {
          allCandidates.push({
            sgId: item.sgId ?? electionId,
            sggName: item.sggName ?? "",
            sdName: item.sdName ?? "",
            jdName: item.jdName ?? "",
            name: item.name ?? "",
            birthday: item.birthday ?? "",
            age: item.age ?? "",
            addr: item.addr ?? "",
            jobId: item.jobId ?? "",
            job: item.job ?? "",
            eduId: item.eduId ?? "",
            edu: item.edu ?? "",
            career1: item.career1 ?? "",
            career2: item.career2 ?? "",
            status: item.status ?? "",
          });
        }

        const totalCount = data?.response?.body?.totalCount ?? 0;
        if (pageNo * pageSize >= totalCount) break;

        pageNo++;
        await delay(200); // Rate limit
      } catch (err) {
        logger.error(`NEC candidate fetch page ${pageNo} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    logger.info(`NEC candidate fetch complete: ${allCandidates.length} candidates`);
    return { candidates: allCandidates };
  },
});

export const necPledgeFetcher = task({
  id: "nec-pledge-fetcher",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    electionId: string;
    electionType: string;
  }) => {
    const { electionId, electionType } = payload;
    logger.info("Fetching pledges from NEC API", { electionId, electionType });

    const NEC_API_KEY = process.env.NEC_API_KEY ?? "";

    if (!NEC_API_KEY) {
      logger.error("NEC_API_KEY is not set");
      return { pledges: [] };
    }

    const allPledges: NecPledge[] = [];
    let pageNo = 1;
    const pageSize = 100;

    while (true) {
      try {
        const params = new URLSearchParams({
          serviceKey: NEC_API_KEY,
          sgId: electionId,
          sgTypecode: electionType,
          pageNo: String(pageNo),
          numOfRows: String(pageSize),
          resultType: "json",
        });

        const url = `http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPofelcddPledgeInfoInqire?${params}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          logger.warn(`NEC pledge API returned ${response.status}`);
          break;
        }

        const data = await response.json();
        const items = data?.response?.body?.items?.item ?? [];
        const itemArray = Array.isArray(items) ? items : [items];

        if (itemArray.length === 0) break;

        for (const item of itemArray) {
          allPledges.push({
            sgId: item.sgId ?? electionId,
            sggName: item.sggName ?? "",
            sdName: item.sdName ?? "",
            name: item.name ?? "",
            prmsOrd: item.prmsOrd ?? "",
            prmsRealmName: item.prmsRealmName ?? "",
            prmsTitle: item.prmsTitle ?? "",
            prmmCont: item.prmmCont ?? "",
          });
        }

        const totalCount = data?.response?.body?.totalCount ?? 0;
        if (pageNo * pageSize >= totalCount) break;

        pageNo++;
        await delay(200);
      } catch (err) {
        logger.error(`NEC pledge fetch page ${pageNo} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    logger.info(`NEC pledge fetch complete: ${allPledges.length} pledges`);
    return { pledges: allPledges };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveProvinceCode(sdName: string): string {
  // Map Korean province names to codes using PROVINCE_CODES
  for (const [koreanPrefix, code] of Object.entries(PROVINCE_CODES)) {
    if (sdName.includes(koreanPrefix)) {
      return code;
    }
  }

  // Fallback: try to match common patterns
  const mappings: Record<string, string> = {
    "서울특별시": "seoul",
    "부산광역시": "busan",
    "대구광역시": "daegu",
    "인천광역시": "incheon",
    "광주광역시": "gwangju",
    "대전광역시": "daejeon",
    "울산광역시": "ulsan",
    "세종특별자치시": "sejong",
    "경기도": "gyeonggi",
    "강원특별자치도": "gangwon",
    "충청북도": "chungbuk",
    "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk",
    "전라남도": "jeonnam",
    "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam",
    "제주특별자치도": "jeju",
  };

  return mappings[sdName] ?? sdName.toLowerCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
