"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface AgendaRecord {
  id: string;
  title: string;
  ministry: string;
  minister_name: string;
  status: "proposed" | "discussing" | "decided" | "implementing" | "completed";
  date: string;
  category: string;
  priority: "high" | "medium" | "low";
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface UseRealtimeAgendasOptions {
  status?: string;
  ministry?: string;
}

interface UseRealtimeAgendasReturn {
  agendas: AgendaRecord[];
  loading: boolean;
}

/**
 * Real-time agendas hook.
 * Fetches agendas with optional status/ministry filters
 * and subscribes to postgres_changes on the agendas table.
 */
export function useRealtimeAgendas(
  options: UseRealtimeAgendasOptions = {},
): UseRealtimeAgendasReturn {
  const { status, ministry } = options;
  const [agendas, setAgendas] = useState<AgendaRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (ministry) params.set("ministry", ministry);

        const qs = params.toString();
        const url = `/api/agendas${qs ? `?${qs}` : ""}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: AgendaRecord[] = await res.json();
        if (!cancelled) setAgendas(data);
      } catch (err) {
        console.error("[useRealtimeAgendas] Initial fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInitial();

    const supabase = createBrowserClient();

    const channel = supabase
      .channel("realtime-agendas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendas",
        },
        (payload: RealtimePostgresChangesPayload<AgendaRecord>) => {
          const newRecord = payload.new as AgendaRecord;
          const oldRecord = payload.old as AgendaRecord;

          // Client-side filter: only include if it matches the filter criteria
          const matchesFilter = (record: AgendaRecord) => {
            if (status && record.status !== status) return false;
            if (ministry && record.ministry !== ministry) return false;
            return true;
          };

          if (payload.eventType === "INSERT") {
            if (matchesFilter(newRecord)) {
              setAgendas((prev) => [newRecord, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            setAgendas((prev) => {
              // If update makes it no longer match the filter, remove it
              if (!matchesFilter(newRecord)) {
                return prev.filter((a) => a.id !== newRecord.id);
              }
              // If it was already in list, update in place
              const exists = prev.some((a) => a.id === newRecord.id);
              if (exists) {
                return prev.map((a) =>
                  a.id === newRecord.id ? newRecord : a,
                );
              }
              // If it now matches but wasn't in list, add it
              return [newRecord, ...prev];
            });
          } else if (payload.eventType === "DELETE") {
            setAgendas((prev) =>
              prev.filter((a) => a.id !== oldRecord.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [status, ministry]);

  return { agendas, loading };
}
