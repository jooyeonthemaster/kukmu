import { createClient } from "@supabase/supabase-js";
import { logger } from "@trigger.dev/sdk/v3";

// ---------------------------------------------------------------------------
// Shared Supabase client (service role for server-side writes)
// ---------------------------------------------------------------------------

export const supabase = createClient(
  process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// Province code <-> UUID resolution (with in-memory cache)
// ---------------------------------------------------------------------------

const provinceCache = new Map<string, string>();

/**
 * Resolve province code (e.g. "seoul") to UUID.
 * Auto-creates the province row if it doesn't exist.
 */
export async function resolveProvinceId(
  code: string,
  name?: string,
): Promise<string | null> {
  if (provinceCache.has(code)) return provinceCache.get(code)!;

  const { data, error } = await supabase
    .from("provinces")
    .upsert({ code, name: name ?? code }, { onConflict: "code" })
    .select("id")
    .single();

  if (error || !data) {
    logger.warn(`Failed to resolve province: ${code}`, {
      error: error?.message,
    });
    return null;
  }

  provinceCache.set(code, data.id);
  return data.id;
}

/**
 * Look up a candidate by province_id + name + party -> UUID.
 */
export async function resolveCandidateId(
  provinceId: string,
  name: string,
  party: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id")
    .eq("province_id", provinceId)
    .eq("name", name)
    .eq("party", party)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

/**
 * Look up a raw_poll by nesdc_id -> UUID.
 */
export async function resolveRawPollId(
  nesdcId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("raw_polls")
    .select("id")
    .eq("nesdc_id", nesdcId)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

export function clearProvinceCache() {
  provinceCache.clear();
}
