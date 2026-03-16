"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import ElectionHeader from "@/components/election/election-header";
import DistrictPanel from "@/components/election/district-panel";
import { provinces } from "@/lib/election-data";
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

export default function LocalElectionPage() {
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);

  const handleProvinceSelect = (p: Province | null) => {
    setSelectedProvince(p);
    setSelectedDistrict(null); // reset district when province changes
  };

  const handleDistrictSelect = (d: District | null) => {
    setSelectedDistrict(d);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a] text-white">
      <ElectionHeader />

      {/* Province quick nav */}
      <div className="shrink-0 border-b border-white/5 bg-[#080c18]">
        <ProvinceOverview onSelect={handleProvinceSelect} selectedCode={selectedProvince?.code || null} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          <KoreaMap
            onProvinceSelect={handleProvinceSelect}
            onDistrictSelect={handleDistrictSelect}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
          />

          {/* Floating national summary */}
          {!selectedProvince && (
            <div className="absolute top-4 right-4 z-[1000] w-64 rounded-lg bg-[#0d1220]/90 backdrop-blur border border-white/10 p-3">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">전국 판세 요약</div>
              <div className="grid grid-cols-2 gap-2">
                {(["ppp", "dp"] as const).map(partyId => {
                  const count = provinces.filter(p => p.leadingParty === partyId).length;
                  return (
                    <div key={partyId} className="rounded-md p-2 text-center" style={{ background: PARTIES[partyId].lightColor }}>
                      <div className="font-data text-lg font-bold" style={{ color: PARTIES[partyId].textColor }}>{count}</div>
                      <div className="text-[10px]" style={{ color: PARTIES[partyId].textColor, opacity: 0.7 }}>{PARTIES[partyId].name}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] text-white/25 text-center">최신 여론조사 기준 우세 지역 수</div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="w-[400px] shrink-0 border-l border-white/5 bg-[#0d1220]">
          <DistrictPanel
            province={selectedProvince}
            district={selectedDistrict}
            onDistrictSelect={handleDistrictSelect}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 h-7 flex items-center justify-between border-t border-white/5 bg-[#080c18] px-4">
        <div className="flex items-center gap-3 text-[10px] text-white/25">
          <span>DATA SOURCE: 중앙선거관리위원회 · 한국갤럽 · 리얼미터 · NBS</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-white/25">
          <span>지도 데이터: 통계청 KOSTAT 2018 (시/군/구 226개)</span>
          <span>•</span>
          <span className="text-cyan-400/40">KUKMU NOTION v2.0 — LOCAL ELECTION EDITION</span>
        </div>
      </div>
    </div>
  );
}
