"use client";

import { PARTIES, type Province, type District } from "@/lib/election-types";
import { getDistrictsByProvince } from "@/lib/district-data";
import PollChart from "./poll-chart";

interface Props {
  province: Province | null;
  district: District | null;
  onDistrictSelect: (district: District | null) => void;
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400",
  };
  return <div className={`h-1.5 w-1.5 rounded-full ${colors[severity] || "bg-gray-400"}`} />;
}

// ─── District detail view (구/군/시 level) ───
function DistrictDetail({ district, province, onBack }: { district: District; province: Province; onBack: () => void }) {
  const maxPct = Math.max(...district.candidates.map(c => c.percentage));

  return (
    <div className="flex h-full flex-col overflow-y-auto custom-dark-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/5 bg-[#0d1220]/95 backdrop-blur p-4">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 mb-2 transition">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 12l6-6M3 12l6 6" /></svg>
          {province.name} 전체로
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{district.name}</h2>
            <span className="text-xs text-white/30">{province.name}</span>
          </div>
          <div className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{
            background: PARTIES[district.leadingParty].lightColor,
            color: PARTIES[district.leadingParty].textColor,
          }}>
            {PARTIES[district.leadingParty].name} 우세
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/5 px-2 py-1.5 text-center">
            <div className="font-data text-sm font-bold text-white/90">{(district.population / 10000).toFixed(1)}만</div>
            <div className="text-[10px] text-white/30">인구</div>
          </div>
          <div className="rounded-md bg-white/5 px-2 py-1.5 text-center">
            <div className="font-data text-sm font-bold text-white/90">{(district.pollPct[0] - district.pollPct[1]).toFixed(1)}%p</div>
            <div className="text-[10px] text-white/30">격차</div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-5">
        {/* Poll results */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">기초단체장 여론조사</h3>
          <div className="space-y-2">
            {district.candidates.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="w-14 text-right">
                  <span className="text-xs font-medium text-white/80">{c.name}</span>
                </div>
                <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{ width: `${(c.percentage / maxPct) * 100}%`, background: PARTIES[c.party].color, opacity: 0.7 }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 font-data text-[11px] font-bold text-white">{c.percentage}%</span>
                </div>
                <div className="w-12 text-[10px] text-white/30">{PARTIES[c.party].name.slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Candidates */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">기초단체장 후보</h3>
          <div className="space-y-2">
            {district.candidates.map((cand) => (
              <div key={cand.name} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                    {cand.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-white/90">{cand.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                        {PARTIES[cand.party].name}
                      </span>
                      {cand.incumbent && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">현직</span>
                      )}
                    </div>
                    <div className="font-data text-[11px] text-white/40 mt-0.5">지지율 {cand.percentage}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Issues */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">지역 현안</h3>
          <div className="space-y-1.5">
            {district.issues.map((iss, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                <span className="flex-1 text-xs text-white/70">{iss}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Province overview with district list ───
function ProvinceDetail({ province, onDistrictClick }: { province: Province; onDistrictClick: (d: District) => void }) {
  const districtList = getDistrictsByProvince(province.code);
  const latestPoll = province.polls[0];
  const sortedResults = latestPoll ? [...latestPoll.results].sort((a, b) => b.percentage - a.percentage) : [];
  const maxPct = sortedResults[0]?.percentage || 100;

  return (
    <div className="flex h-full flex-col overflow-y-auto custom-dark-scrollbar">
      {/* Province header */}
      <div className="sticky top-0 z-10 border-b border-white/5 bg-[#0d1220]/95 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{province.name}</h2>
            <span className="text-xs text-white/30">{province.nameEn}</span>
          </div>
          <div className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{
            background: PARTIES[province.leadingParty].lightColor,
            color: PARTIES[province.leadingParty].textColor,
          }}>
            {PARTIES[province.leadingParty].name} 우세
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["인구", `${(province.population / 10000).toFixed(0)}만`],
            ["유권자", `${(province.voterCount / 10000).toFixed(0)}만`],
            ["의석", `${province.councilSeats}석`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-white/5 px-2 py-1.5 text-center">
              <div className="font-data text-sm font-bold text-white/90">{value}</div>
              <div className="text-[10px] text-white/30">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-5">
        {/* District list — THE KEY FEATURE */}
        {districtList.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
              기초자치단체 ({districtList.length}개)
              <span className="ml-2 text-[9px] text-cyan-400/50 normal-case">클릭하여 상세보기</span>
            </h3>
            <div className="space-y-1">
              {districtList
                .sort((a, b) => b.population - a.population)
                .map((dist) => {
                  const gap = dist.pollPct[0] - dist.pollPct[1];
                  return (
                    <button
                      key={dist.code}
                      onClick={() => onDistrictClick(dist)}
                      className="w-full flex items-center gap-2 rounded-md bg-white/[0.03] border border-white/5 px-3 py-2 hover:bg-white/[0.06] hover:border-white/10 transition text-left group"
                    >
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: PARTIES[dist.leadingParty].color }} />
                      <span className="flex-1 text-xs font-medium text-white/70 group-hover:text-white/90">{dist.name}</span>
                      <span className="font-data text-[10px] text-white/40">{(dist.population / 10000).toFixed(0)}만</span>
                      <div className="flex items-center gap-1 ml-1">
                        <span className="font-data text-[10px] font-bold" style={{ color: PARTIES[dist.leadingParty].textColor }}>
                          {dist.candidates[0].name} {dist.pollPct[0]}%
                        </span>
                        <span className="text-[9px] text-white/20">
                          (+{gap.toFixed(1)})
                        </span>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-cyan-400 transition shrink-0">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        {/* Latest poll - province level (광역단체장) */}
        {latestPoll && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">광역단체장 여론조사</h3>
              <span className="text-[10px] text-white/25">{latestPoll.source} | {latestPoll.date}</span>
            </div>
            <div className="space-y-2">
              {sortedResults.map((r) => (
                <div key={r.candidateName} className="flex items-center gap-2">
                  <div className="w-14 text-right">
                    <span className="text-xs font-medium text-white/80">{r.candidateName}</span>
                  </div>
                  <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                    <div className="h-full rounded transition-all duration-500"
                      style={{ width: `${(r.percentage / maxPct) * 100}%`, background: PARTIES[r.party].color, opacity: 0.7 }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-data text-[11px] font-bold text-white">{r.percentage}%</span>
                  </div>
                  <div className="w-12 text-[10px] text-white/30">{PARTIES[r.party].name.slice(0, 3)}</div>
                </div>
              ))}
              <div className="text-[10px] text-white/20 mt-1">
                표본 {latestPoll.sampleSize.toLocaleString()}명 | 오차범위 ±{latestPoll.marginOfError}%p
              </div>
            </div>
          </section>
        )}

        {/* Poll trend chart */}
        {province.polls.length > 1 && (
          <section>
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">여론조사 추이</h3>
            <PollChart province={province} />
          </section>
        )}

        {/* Candidates */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">광역단체장 후보</h3>
          <div className="space-y-2">
            {province.candidates.map((cand) => (
              <div key={cand.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                    {cand.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-white/90">{cand.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                        {PARTIES[cand.party].name}
                      </span>
                      {cand.incumbent && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">현직</span>}
                    </div>
                    <div className="text-[10px] text-white/30 truncate">{cand.career[0]}</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-white/40 uppercase">주요 공약</div>
                  {cand.pledges.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-white/60">
                      <span className="text-cyan-400/60 mt-0.5">•</span>
                      <span className="leading-tight">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Issues */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">지역 주요 이슈</h3>
          <div className="space-y-1.5">
            {province.issues.map((iss, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2">
                <SeverityDot severity={iss.severity} />
                <span className="flex-1 text-xs text-white/70">{iss.title}</span>
                <span className="text-[10px] text-white/25 shrink-0">{iss.category}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Historical results */}
        {province.history.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">역대 선거 결과</h3>
            <div className="space-y-1.5">
              {province.history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="font-data text-xs text-white/50 w-10">{h.year}</span>
                  <span className="text-xs font-medium text-white/70">{h.winner}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: PARTIES[h.party].lightColor, color: PARTIES[h.party].textColor }}>
                    {PARTIES[h.party].name}
                  </span>
                  <span className="ml-auto font-data text-xs text-white/50">{h.percentage}%</span>
                  <span className="text-[10px] text-white/25">투표율 {h.turnout}%</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Main panel component ───
export default function DistrictPanel({ province, district, onDistrictSelect }: Props) {
  if (!province) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center px-8">
          <div className="text-4xl mb-3 opacity-20">🗺</div>
          <div className="text-sm text-white/30 font-medium">지도에서 지역을 선택하세요</div>
          <div className="text-xs text-white/15 mt-1">클릭하면 상세 정보를 확인할 수 있습니다</div>
        </div>
      </div>
    );
  }

  if (district) {
    return <DistrictDetail district={district} province={province} onBack={() => onDistrictSelect(null)} />;
  }

  return <ProvinceDetail province={province} onDistrictClick={onDistrictSelect} />;
}
