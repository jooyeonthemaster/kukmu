"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Browser-side Supabase client (anon key, RLS enforced).
 * Singleton pattern to avoid creating multiple GoTrue instances.
 */
export function createBrowserClient() {
  if (browserClient) return browserClient;

  browserClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return browserClient;
}
