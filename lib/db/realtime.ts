/**
 * Supabase Realtime hooks - 국무노션 (GukmuNotion)
 *
 * React hooks that subscribe to Supabase Realtime channels
 * for live updates on polls, hot topics, news, and agendas.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  LatestPoll,
  HotTopic,
  RecentSignificantNews,
  Agenda,
} from "./database.types";

// ────────────────────────────────────────────────────────────
// Shared browser client (singleton)
// ────────────────────────────────────────────────────────────

let browserClient: SupabaseClient<Database> | null = null;

function getClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  browserClient = createClient<Database>(url, key);
  return browserClient;
}

// ────────────────────────────────────────────────────────────
// useRealtimePolls
// ────────────────────────────────────────────────────────────

interface UseRealtimePollsResult {
  polls: LatestPoll[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Subscribe to real-time poll updates for a specific province.
 * Automatically re-fetches from v_latest_polls when poll_results change.
 */
export function useRealtimePolls(
  provinceCode: string | null
): UseRealtimePollsResult {
  const [polls, setPolls] = useState<LatestPoll[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchPolls = useCallback(async () => {
    if (!provinceCode) return;
    try {
      const client = getClient();
      const { data, error: fetchError } = await client
        .from("v_latest_polls" as never)
        .select("*")
        .eq("province_code", provinceCode)
        .order("percentage", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setPolls((data as unknown as LatestPoll[]) ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [provinceCode]);

  useEffect(() => {
    if (!provinceCode) {
      setPolls([]);
      return;
    }

    const client = getClient();

    // Initial fetch
    fetchPolls();

    // Subscribe to poll_results changes and refetch
    const channel = client
      .channel(`polls:${provinceCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "poll_results",
        },
        () => {
          fetchPolls();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "polls",
        },
        () => {
          fetchPolls();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [provinceCode, fetchPolls]);

  return { polls, isConnected, error };
}

// ────────────────────────────────────────────────────────────
// useRealtimeHotTopics
// ────────────────────────────────────────────────────────────

interface UseRealtimeHotTopicsResult {
  topics: HotTopic[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Subscribe to real-time hot topic changes.
 * Updates whenever a row in hot_topics is inserted or updated.
 */
export function useRealtimeHotTopics(
  limit: number = 20
): UseRealtimeHotTopicsResult {
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      const client = getClient();
      const { data, error: fetchError } = await client
        .from("hot_topics")
        .select("*")
        .order("count", { ascending: false })
        .limit(limit);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setTopics((data as unknown as HotTopic[]) ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [limit]);

  useEffect(() => {
    const client = getClient();

    fetchTopics();

    const channel = client
      .channel("hot-topics-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hot_topics",
        },
        () => {
          fetchTopics();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchTopics]);

  return { topics, isConnected, error };
}

// ────────────────────────────────────────────────────────────
// useRealtimeNews
// ────────────────────────────────────────────────────────────

interface UseRealtimeNewsResult {
  news: RecentSignificantNews[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Subscribe to real-time significant news updates.
 * Refetches from v_recent_significant_news when analyzed_articles change.
 */
export function useRealtimeNews(limit: number = 20): UseRealtimeNewsResult {
  const [news, setNews] = useState<RecentSignificantNews[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const client = getClient();
      const { data, error: fetchError } = await client
        .from("v_recent_significant_news" as never)
        .select("*")
        .limit(limit);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setNews((data as unknown as RecentSignificantNews[]) ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [limit]);

  useEffect(() => {
    const client = getClient();

    fetchNews();

    const channel = client
      .channel("news-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "analyzed_articles",
        },
        () => {
          fetchNews();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchNews]);

  return { news, isConnected, error };
}

// ────────────────────────────────────────────────────────────
// useRealtimeAgendas
// ────────────────────────────────────────────────────────────

interface UseRealtimeAgendasResult {
  agendas: Agenda[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Subscribe to real-time agenda changes (status updates, new items).
 * Useful for the workspace/government dashboard.
 */
export function useRealtimeAgendas(
  options: { ministry?: string; status?: string; limit?: number } = {}
): UseRealtimeAgendasResult {
  const { ministry, status, limit = 50 } = options;
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchAgendas = useCallback(async () => {
    try {
      const client = getClient();
      let query = client
        .from("agendas")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (ministry) {
        query = query.eq("ministry", ministry);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setAgendas((data as unknown as Agenda[]) ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [ministry, status, limit]);

  useEffect(() => {
    const client = getClient();

    fetchAgendas();

    const channel = client
      .channel("agendas-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendas",
        },
        () => {
          fetchAgendas();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchAgendas]);

  return { agendas, isConnected, error };
}
