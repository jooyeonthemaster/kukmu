"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import ElectionHeader from "@/components/election/election-header";
import DistrictPanel from "@/components/election/district-panel";
import { ElectionDataProvider, useElection } from "@/lib/election-context";
import { PARTIES, type Province, type District } from "@/lib/election-types";

const KoreaMap = dynamic(() => import("@/components/election/korea-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0e1a]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
        <span className="text-sm text-cyan-400/60">지도 초기화 중...</span>
      </div>
    </div>
  ),
});

function ProvinceOverview({ onSelect, selectedCode }: { onSelect: (p: Province) => void; selectedCode: string | null }) {
  const { provinces } = useElection();

  const sorted = [...provinces].sort((a, b) => {
    const aLead = a.polls[0]?.results[0]?.percentage || 0;
    const bLead = b.polls[0]?.results[0]?.percentage || 0;
    return bLead - aLead;
  });

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-1.5 scrollbar-none">
      {sorted.map(p => {
        const latest = p.polls[0];
        const leader = latest?.results.sort((a, b) => b.percentage - a.percentage)[0];
        const isActive = p.code === selectedCode;
        return (
          <button
            key={p.code}
            onClick={() => onSelect(p)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 transition group ${
              isActive
                ? "bg-white/[0.08] border-cyan-500/30 ring-1 ring-cyan-500/20"
                : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
            }`}
          >
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: PARTIES[p.leadingParty].color }} />
            <span className={`text-[11px] font-medium ${isActive ? "text-cyan-400" : "text-white/60 group-hover:text-white/80"}`}>
              {p.name.replace(/특별시|광역시|특별자치시|특별자치도|도/g, "")}
            </span>
            {leader && (
              <span className="font-data text-[10px] text-white/30">{leader.candidateName} {leader.percentage}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ElectionContent() {
  const { provinces, loading, error, loadDistricts } = useElection();
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);

  const handleProvinceSelect = (p: Province | null) => {
    setSelectedProvince(p);
    setSelectedDistrict(null);
    if (p) {
      loadDistricts(p.code);
    }
  };

  const handleDistrictSelect = (d: District | null) => {
    setSelectedDistrict(d);
  };

  // When provinces update from the API, refresh selectedProvince reference
  useEffect(() => {
    if (selectedProvince && provinces.length > 0) {
      const updated = provinces.find((p) => p.code === selectedProvince.code);
      if (updated && updated !== selectedProvince) {
        setSelectedProvince(updated);
      }
    }
  }, [provinces, selectedProvince]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a] text-white">
        <ElectionHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
            <span className="text-sm text-cyan-400/60">선거 데이터 불러오는 중...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a] text-white">
        <ElectionHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-sm text-red-400 mb-2">{error}</div>
            <button onClick={() => window.location.reload()} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a] text-white">
      <ElectionHeader />

      {/* Province quick nav */}
      <div className="shrink-0 border-b border-white/5 bg-[#080c18]">
        <ProvinceOverview onSelect={handleProvinceSelect} selectedCode={selectedProvince?.code || null} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Map area */}
        <div className="flex-1 relative min-h-[40vh]">
          <KoreaMap
            onProvinceSelect={handleProvinceSelect}
            onDistrictSelect={handleDistrictSelect}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
          />

          {/* Floating national summary */}
          {!selectedProvince && (
            <div className="absolute top-2 right-2 md:top-4 md:right-4 z-[1000] w-[180px] md:w-64 rounded-lg bg-[#0d1220]/90 backdrop-blur border border-white/10 p-2 md:p-3 shadow-xl">
              <div className="text-[9px] md:text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-1.5 md:mb-2 text-center md:text-left">전국 판세 요약</div>
              <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                {(["ppp", "dp"] as const).map(partyId => {
                  const count = provinces.filter(p => p.leadingParty === partyId).length;
                  return (
                    <div key={partyId} className="rounded-md p-1.5 md:p-2 text-center" style={{ background: PARTIES[partyId].lightColor }}>
                      <div className="font-data text-base md:text-lg font-bold" style={{ color: PARTIES[partyId].textColor }}>{count}</div>
                      <div className="text-[9px] md:text-[10px]" style={{ color: PARTIES[partyId].textColor, opacity: 0.7 }}>{PARTIES[partyId].name}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 md:mt-2 text-[8px] md:text-[10px] text-white/25 text-center px-1">최신 여론조사 우세 지역</div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className={`w-full md:w-[400px] flex flex-col shrink-0 border-t md:border-t-0 md:border-l border-white/5 bg-[#0d1220] transition-all duration-300 ${!selectedProvince ? 'hidden md:flex flex-col h-full' : 'h-[50vh] md:h-full'}`}>
          <div className="flex-1 overflow-y-auto">
            <DistrictPanel
              province={selectedProvince}
              district={selectedDistrict}
              onDistrictSelect={handleDistrictSelect}
            />
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 py-1 md:py-0 md:h-7 flex flex-col md:flex-row items-center justify-center md:justify-between border-t border-white/5 bg-[#080c18] px-2 md:px-4 gap-0.5 md:gap-0">
        <div className="flex items-center gap-1.5 md:gap-3 text-[9px] md:text-[10px] text-white/25 flex-wrap justify-center">
          <span>DATA SOURCE: 중앙선관위 · 한국갤럽 · 리얼미터 · NBS</span>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 text-[9px] md:text-[10px] text-white/25 flex-wrap justify-center">
          <span className="hidden md:inline">지도 데이터: 통계청 KOSTAT 2018 (시/군/구 226개)</span>
          <span className="hidden md:inline">•</span>
          <span className="text-cyan-400/40 font-medium">KUKMU NOTION v2.0 — LOCAL ELECTION</span>
        </div>
      </div>
    </div>
  );
}

export default function LocalElectionPage() {
  return (
    <ElectionDataProvider>
      <ElectionContent />
    </ElectionDataProvider>
  );
}
