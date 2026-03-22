"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface PollRecord {
  id: string;
  province: string;
  candidate_name: string;
  party: string;
  percentage: number;
  date: string;
  source: string;
  sample_size: number;
  margin_of_error: number;
  [key: string]: unknown;
}

interface UseRealtimePollsReturn {
  polls: PollRecord[];
  loading: boolean;
  error: string | null;
}

export function useRealtimePolls(
  provinceCode: string,
): UseRealtimePollsReturn {
  const [polls, setPolls] = useState<PollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/polls?province=${encodeURIComponent(provinceCode)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PollRecord[] = await res.json();
      setPolls(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "여론조사 로딩 실패",
      );
    } finally {
      setLoading(false);
    }
  }, [provinceCode]);

  useEffect(() => {
    fetchPolls();

    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`polls:${provinceCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "polls",
          filter: `province=eq.${provinceCode}`,
        },
        (payload: RealtimePostgresChangesPayload<PollRecord>) => {
          if (payload.eventType === "INSERT") {
            setPolls((prev) => [payload.new as PollRecord, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setPolls((prev) =>
              prev.map((p) =>
                p.id === (payload.new as PollRecord).id
                  ? (payload.new as PollRecord)
                  : p,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setPolls((prev) =>
              prev.filter(
                (p) => p.id !== (payload.old as PollRecord).id,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [provinceCode, fetchPolls]);

  return { polls, loading, error };
}
