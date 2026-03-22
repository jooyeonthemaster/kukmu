"use client";

import { useState, useEffect, useCallback } from "react";
import type { Province, District, ElectionStats } from "@/lib/election-types";

interface ElectionData {
  provinces: Province[];
  loading: boolean;
  error: string | null;
  /** Fetch districts for a given province code. Cached after first fetch. */
  getDistrictsByProvince: (provinceCode: string) => District[];
  /** Load districts from the API (call when province selected). */
  loadDistricts: (provinceCode: string) => Promise<void>;
  /** Computed stats for the header. */
  stats: ElectionStats;
}

export function useElectionData(): ElectionData {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districtCache, setDistrictCache] = useState<Record<string, District[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch provinces on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/election/provinces");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Province[] = await res.json();
        if (!cancelled) {
          setProvinces(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("[useElectionData] Failed to load provinces:", err);
        if (!cancelled) {
          setError("데이터를 불러올 수 없습니다.");
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const loadDistricts = useCallback(async (provinceCode: string) => {
    if (districtCache[provinceCode]) return; // already loaded
    try {
      const res = await fetch(`/api/election/districts?province=${provinceCode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: District[] = await res.json();
      setDistrictCache((prev) => ({ ...prev, [provinceCode]: data }));
    } catch (err) {
      console.error(`[useElectionData] Failed to load districts for ${provinceCode}:`, err);
    }
  }, [districtCache]);

  const getDistrictsByProvince = useCallback(
    (provinceCode: string): District[] => {
      return districtCache[provinceCode] || [];
    },
    [districtCache],
  );

  const stats: ElectionStats = {
    totalProvinces: provinces.length,
    totalCandidates: provinces.reduce((sum, p) => sum + p.candidates.length, 0),
    totalPolls: provinces.reduce((sum, p) => sum + p.polls.length, 0),
    averageTurnout2022: 52.7,
    electionDate: "2026-06-03",
    dDay: Math.ceil(
      (new Date(2026, 5, 3).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  };

  return { provinces, loading, error, getDistrictsByProvince, loadDistricts, stats };
}
