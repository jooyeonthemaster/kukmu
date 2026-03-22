"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface HotTopicRecord {
  id: string;
  keyword: string;
  count: number;
  trend: "rising" | "falling" | "steady";
  related_ministry: string | null;
  category: string | null;
  updated_at: string;
}

interface UseRealtimeHotTopicsReturn {
  topics: HotTopicRecord[];
  loading: boolean;
}

/**
 * Real-time hot topics hook.
 * Fetches top 20 hot topics and subscribes to changes on the hot_topics table.
 */
export function useRealtimeHotTopics(): UseRealtimeHotTopicsReturn {
  const [topics, setTopics] = useState<HotTopicRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      try {
        const res = await fetch("/api/hot-topics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: HotTopicRecord[] = await res.json();
        if (!cancelled) setTopics(data);
      } catch (err) {
        console.error("[useRealtimeHotTopics] Initial fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInitial();

    const supabase = createBrowserClient();

    const channel = supabase
      .channel("realtime-hot-topics")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hot_topics",
        },
        (payload: RealtimePostgresChangesPayload<HotTopicRecord>) => {
          if (payload.eventType === "INSERT") {
            setTopics((prev) => {
              const updated = [payload.new as HotTopicRecord, ...prev];
              return updated
                .sort((a, b) => b.count - a.count)
                .slice(0, 20);
            });
          } else if (payload.eventType === "UPDATE") {
            setTopics((prev) => {
              const updated = prev.map((t) =>
                t.id === (payload.new as HotTopicRecord).id
                  ? (payload.new as HotTopicRecord)
                  : t,
              );
              return updated.sort((a, b) => b.count - a.count);
            });
          } else if (payload.eventType === "DELETE") {
            setTopics((prev) =>
              prev.filter(
                (t) => t.id !== (payload.old as HotTopicRecord).id,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { topics, loading };
}
