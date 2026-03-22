"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useElectionData } from "@/lib/hooks/use-election-data";
import type { Province, District, ElectionStats } from "@/lib/election-types";

interface ElectionContextValue {
  provinces: Province[];
  loading: boolean;
  error: string | null;
  getDistrictsByProvince: (provinceCode: string) => District[];
  loadDistricts: (provinceCode: string) => Promise<void>;
  stats: ElectionStats;
}

const ElectionContext = createContext<ElectionContextValue | null>(null);

export function ElectionDataProvider({ children }: { children: ReactNode }) {
  const data = useElectionData();
  return (
    <ElectionContext.Provider value={data}>{children}</ElectionContext.Provider>
  );
}

export function useElection(): ElectionContextValue {
  const ctx = useContext(ElectionContext);
  if (!ctx) {
    throw new Error("useElection must be used within <ElectionDataProvider>");
  }
  return ctx;
}
