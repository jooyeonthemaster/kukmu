import { task, logger } from "@trigger.dev/sdk/v3";
import { supabase, resolveProvinceId } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Types (aligned with DB schema)
// ---------------------------------------------------------------------------

export interface CandidateData {
  province_code: string;
  name: string;
  party: string;
  age: number | null;
  incumbent: boolean;              // mapped to DB "is_incumbent"
  career: string[];
  pledges: string[];
  image_url: string | null;        // mapped to DB "photo_url"
  registration_date: string | null; // not in DB schema, ignored
  nec_candidate_id: string | null; // mapped to DB "nec_id"
}

export interface UpsertCandidatesResult {
  updatedCount: number;
  newCount: number;
}

// Province name mapping for auto-creation
const PROVINCE_NAMES: Record<string, string> = {
  seoul: "서울특별시",
  busan: "부산광역시",
  daegu: "대구광역시",
  incheon: "인천광역시",
  gwangju: "광주광역시",
  daejeon: "대전광역시",
  ulsan: "울산광역시",
  sejong: "세종특별자치시",
  gyeonggi: "경기도",
  gangwon: "강원특별자치도",
  chungbuk: "충청북도",
  chungnam: "충청남도",
  jeonbuk: "전북특별자치도",
  jeonnam: "전라남도",
  gyeongbuk: "경상북도",
  gyeongnam: "경상남도",
  jeju: "제주특별자치도",
};

// ---------------------------------------------------------------------------
// Task: upsert-candidates
// ---------------------------------------------------------------------------

export const upsertCandidates = task({
  id: "upsert-candidates",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    candidates: CandidateData[];
  }): Promise<UpsertCandidatesResult> => {
    const { candidates } = payload;

    if (candidates.length === 0) {
      logger.info("No candidates to upsert");
      return { updatedCount: 0, newCount: 0 };
    }

    logger.info(`Upserting ${candidates.length} candidates`);

    // 1. Resolve all province_codes to province_id UUIDs
    const provinceCodesSet = new Set(candidates.map((c) => c.province_code));
    const provinceIdMap = new Map<string, string>();

    for (const code of provinceCodesSet) {
      const name = PROVINCE_NAMES[code];
      const provinceId = await resolveProvinceId(code, name);
      if (provinceId) {
        provinceIdMap.set(code, provinceId);
      } else {
        logger.warn(`Could not resolve province: ${code}`);
      }
    }

    // 2. Fetch existing candidates to diff
    const provinceIds = Array.from(provinceIdMap.values());
    const { data: existing, error: fetchError } = await supabase
      .from("candidates")
      .select("id, province_id, name, party, pledges, career")
      .in("province_id", provinceIds);

    if (fetchError) {
      logger.error("Failed to fetch existing candidates", {
        error: fetchError.message,
      });
      throw new Error(`Supabase fetch error: ${fetchError.message}`);
    }

    // Build lookup: province_id + name + party -> existing row
    const existingMap = new Map(
      (existing ?? []).map((c) => [
        `${c.province_id}::${c.name}::${c.party}`,
        c,
      ]),
    );

    let newCount = 0;
    let updatedCount = 0;

    // 3. Process in batches of 50
    const BATCH_SIZE = 50;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      const rows = [];

      for (const c of batch) {
        const provinceId = provinceIdMap.get(c.province_code);
        if (!provinceId) continue;

        const key = `${provinceId}::${c.name}::${c.party}`;
        const existingRow = existingMap.get(key);
        const isNew = !existingRow;

        if (isNew) {
          newCount++;
        } else {
          updatedCount++;
        }

        rows.push({
          ...(existingRow?.id ? { id: existingRow.id } : {}),
          province_id: provinceId,        // province_code -> province_id UUID
          name: c.name,
          party: c.party,
          age: c.age,
          is_incumbent: c.incumbent,      // incumbent -> is_incumbent
          career: c.career,
          pledges: c.pledges,
          photo_url: c.image_url,         // image_url -> photo_url
          nec_id: c.nec_candidate_id,     // nec_candidate_id -> nec_id
          updated_at: new Date().toISOString(),
        });
      }

      if (rows.length === 0) continue;

      const { error: upsertError } = await supabase
        .from("candidates")
        .upsert(rows, {
          onConflict: "province_id,name,party",
        });

      if (upsertError) {
        logger.error(`Batch upsert failed at offset ${i}`, {
          error: upsertError.message,
        });
        throw new Error(`Supabase upsert error: ${upsertError.message}`);
      }

      logger.info(`Candidate batch ${Math.floor(i / BATCH_SIZE) + 1} complete`, {
        batchSize: rows.length,
      });
    }

    logger.info("Candidate upsert complete", { newCount, updatedCount });

    return { updatedCount, newCount };
  },
});
