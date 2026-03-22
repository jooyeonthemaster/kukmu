"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

interface NewsRecord {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  summary: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  relevance_score: number;
  is_significant: boolean;
  province: string | null;
  [key: string]: unknown;
}

interface UseRealtimeNewsReturn {
  news: NewsRecord[];
  loading: boolean;
}

/**
 * Real-time news feed hook.
 * Fetches initial significant news and subscribes to new INSERT events
 * on analyzed_articles where is_significant = true.
 */
export function useRealtimeNews(limit = 20): UseRealtimeNewsReturn {
  const [news, setNews] = useState<NewsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const maxItems = useRef(limit);
  maxItems.current = limit;

  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      try {
        const res = await fetch(
          `/api/news?significant=true&limit=${limit}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NewsRecord[] = await res.json();
        if (!cancelled) {
          setNews(data);
        }
      } catch (err) {
        console.error("[useRealtimeNews] Initial fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInitial();

    const supabase = createBrowserClient();

    const channel = supabase
      .channel("realtime-news")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "analyzed_articles",
          filter: "is_significant=eq.true",
        },
        (payload: RealtimePostgresInsertPayload<NewsRecord>) => {
          setNews((prev) => {
            const updated = [payload.new as NewsRecord, ...prev];
            return updated.slice(0, maxItems.current);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { news, loading };
}
