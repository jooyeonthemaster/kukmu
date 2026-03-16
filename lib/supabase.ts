import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client (anon key, RLS enforced)
 *
 * 타입 안전성: Supabase 프로젝트 생성 후 아래 명령으로 타입 생성
 *   npx supabase gen types typescript --project-id YOUR_ID > lib/database.types.ts
 * 그 후 createClient<Database>() 으로 교체
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Server-side Supabase client (service role, bypasses RLS) */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey);
}
