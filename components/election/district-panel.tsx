"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Quote, AtSign, BarChart3, Newspaper } from "lucide-react";
import { PARTIES, type Province, type District, type ProvinceIssue, type PartyId } from "@/lib/election-types";
import type {
  DistrictDetailData,
  DistrictIssueDetail,
  DistrictIssueArticle,
  DistrictCandidateDetail,
  DistrictCandidateArticle,
} from "@/lib/election-queries";
import { useElection } from "@/lib/election-context";
import PollChart from "./poll-chart";
import NewsFeedMini from "./news-feed-mini";
import CandidateDashboard from "./candidate-dashboard";

interface Props {
  province: Province | null;
  district: District | null;
  onDistrictSelect: (district: District | null) => void;
}

// ── Severity helpers ──

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  critical: { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
  high: { dot: "bg-orange-400", text: "text-orange-400", bg: "bg-orange-400/10" },
  medium: { dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-400/10" },
  low: { dot: "bg-white/30", text: "text-white/40", bg: "bg-white/5" },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "긴급", high: "높음", medium: "보통", low: "낮음",
};

function SeverityDot({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.low;
  return <div className={`h-1.5 w-1.5 rounded-full ${c.dot} shrink-0`} />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.low;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.text} ${c.bg}`}>
      {SEVERITY_LABELS[severity] || severity}
    </span>
  );
}

// ── Grouped & sorted issues with collapsible categories ──

function IssuesSection({ issues, limit = 15 }: { issues: ProvinceIssue[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Sort by severity
  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );

  const display = showAll ? sorted : sorted.slice(0, limit);
  const remaining = sorted.length - limit;

  // Group by category
  const grouped = new Map<string, ProvinceIssue[]>();
  for (const iss of display) {
    const cat = iss.category || "기타";
    const list = grouped.get(cat) || [];
    list.push(iss);
    grouped.set(cat, list);
  }

  // Sort categories by most severe first issue
  const sortedCategories = Array.from(grouped.entries()).sort(([, a], [, b]) => {
    const aSev = SEVERITY_ORDER[a[0].severity] ?? 3;
    const bSev = SEVERITY_ORDER[b[0].severity] ?? 3;
    return aSev - bSev;
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {sortedCategories.map(([category, categoryIssues]) => {
        const isCollapsed = collapsedCategories.has(category);
        return (
          <div key={category}>
            <button
              onClick={() => toggleCategory(category)}
              className="flex items-center gap-1.5 w-full text-left mb-1 group"
            >
              {isCollapsed
                ? <ChevronRight className="h-3 w-3 text-white/30 group-hover:text-white/50 transition" />
                : <ChevronDown className="h-3 w-3 text-white/30 group-hover:text-white/50 transition" />
              }
              <span className="text-[10px] font-medium text-white/50 group-hover:text-white/70 transition uppercase tracking-wider">
                {category}
              </span>
              <span className="text-[9px] text-white/20 ml-1">{categoryIssues.length}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1 ml-4">
                {categoryIssues.map((iss, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2">
                    <SeverityDot severity={iss.severity} />
                    <span className="flex-1 text-xs text-white/70">{iss.title}</span>
                    <SeverityBadge severity={iss.severity} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-md bg-white/[0.03] border border-white/5 py-2 text-[11px] text-cyan-400/60 hover:text-cyan-400 hover:bg-white/[0.05] transition"
        >
          더보기 ({remaining}건)
        </button>
      )}
    </div>
  );
}

// ── Sentiment badge ──

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;
  const config: Record<string, { label: string; cls: string }> = {
    positive: { label: "긍정", cls: "text-emerald-400 bg-emerald-400/10" },
    negative: { label: "부정", cls: "text-red-400 bg-red-400/10" },
    neutral: { label: "중립", cls: "text-white/40 bg-white/5" },
    mixed: { label: "혼합", cls: "text-amber-400 bg-amber-400/10" },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ── Mention type icon + label ──

function MentionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { icon: typeof Quote; label: string; cls: string }> = {
    direct_quote: { icon: Quote, label: "직접 인용", cls: "text-cyan-400" },
    mention: { icon: AtSign, label: "언급", cls: "text-amber-400" },
    analysis: { icon: BarChart3, label: "분석", cls: "text-purple-400" },
  };
  const c = config[type] || config.mention;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${c.cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

// ── Sentiment mini meter ──

function SentimentMeter({ score }: { score: number | null }) {
  if (score === null) return null;
  // score range: -1 to 1, map to 0-100%
  const pct = Math.round((score + 1) * 50);
  const color = score > 0.2 ? "bg-emerald-400" : score < -0.2 ? "bg-red-400" : "bg-amber-400";
  const label = score > 0.2 ? "긍정적" : score < -0.2 ? "부정적" : "중립적";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-white/30">{label} ({score.toFixed(2)})</span>
    </div>
  );
}

// ── Parse context for [정치적 의도] and [정책 입장] sections ──

function ParsedContext({ context }: { context: string }) {
  if (!context) return null;

  const intentMatch = context.match(/\[정치적 의도\]\s*([\s\S]*?)(?=\[|$)/);
  const policyMatch = context.match(/\[정책 입장\]\s*([\s\S]*?)(?=\[|$)/);

  if (!intentMatch && !policyMatch) {
    return <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">{context}</p>;
  }

  return (
    <div className="space-y-1">
      {intentMatch && intentMatch[1].trim() && (
        <div>
          <span className="text-[9px] font-semibold text-amber-400/70 uppercase tracking-wider">정치적 의도</span>
          <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{intentMatch[1].trim()}</p>
        </div>
      )}
      {policyMatch && policyMatch[1].trim() && (
        <div>
          <span className="text-[9px] font-semibold text-cyan-400/70 uppercase tracking-wider">정책 입장</span>
          <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{policyMatch[1].trim()}</p>
        </div>
      )}
    </div>
  );
}

// ── Format date helper ──

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

// ── Simple string issues for districts (fallback when no enriched data) ──

function DistrictIssuesSection({ issues }: { issues: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? issues : issues.slice(0, 10);
  const remaining = issues.length - 10;

  return (
    <div className="space-y-1.5">
      {display.map((iss, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
          <span className="flex-1 text-xs text-white/70">{iss}</span>
        </div>
      ))}
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-md bg-white/[0.03] border border-white/5 py-2 text-[11px] text-cyan-400/60 hover:text-cyan-400 hover:bg-white/[0.05] transition"
        >
          더보기 ({remaining}건)
        </button>
      )}
    </div>
  );
}

// ── Enriched issues with expandable articles ──

function EnrichedIssuesSection({ issues }: { issues: DistrictIssueDetail[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      {issues.map((iss) => {
        const isExpanded = expandedId === iss.id;
        const hasArticles = iss.articles.length > 0;
        return (
          <div key={iss.id}>
            <button
              onClick={() => hasArticles && setExpandedId(isExpanded ? null : iss.id)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-left transition ${
                isExpanded ? "bg-white/[0.06] border border-white/10" : "bg-white/[0.03] border border-transparent hover:bg-white/[0.05]"
              } ${hasArticles ? "cursor-pointer" : "cursor-default"}`}
            >
              <SeverityDot severity={iss.severity} />
              <span className="flex-1 text-xs text-white/70">{iss.title}</span>
              {hasArticles && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400/70 font-medium tabular-nums">
                  {iss.articles.length}
                </span>
              )}
              <SeverityBadge severity={iss.severity} />
              {hasArticles && (
                isExpanded
                  ? <ChevronDown className="h-3 w-3 text-white/30 shrink-0" />
                  : <ChevronRight className="h-3 w-3 text-white/30 shrink-0" />
              )}
            </button>
            {isExpanded && hasArticles && (
              <div className="ml-5 mt-1 mb-2 space-y-1 border-l border-white/5 pl-3">
                {iss.description && (
                  <p className="text-[11px] text-white/40 leading-relaxed mb-2">{iss.description}</p>
                )}
                {iss.articles.map((article, idx) => (
                  <a
                    key={idx}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md bg-white/[0.02] hover:bg-white/[0.05] px-3 py-2 transition group"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-white/70 group-hover:text-cyan-400 transition line-clamp-1">
                            {article.title}
                          </span>
                          <ExternalLink className="h-2.5 w-2.5 text-white/20 group-hover:text-cyan-400/50 shrink-0 transition" />
                        </div>
                        {article.summary && (
                          <p className="text-[10px] text-white/35 leading-relaxed mt-0.5 line-clamp-2">{article.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {article.publishedAt && (
                          <span className="text-[9px] text-white/20 tabular-nums">{formatDate(article.publishedAt)}</span>
                        )}
                        <SentimentBadge sentiment={article.sentiment} />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Enriched candidate card with expandable news ──

function EnrichedCandidateCard({ candidate }: { candidate: DistrictCandidateDetail }) {
  const [expanded, setExpanded] = useState(false);
  const hasArticles = candidate.articles.length > 0;
  const party = PARTIES[candidate.party] || PARTIES.ind;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: party.lightColor, color: party.textColor }}
        >
          {candidate.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white/90">{candidate.name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: party.lightColor, color: party.textColor }}
            >
              {party.name}
            </span>
            {candidate.isIncumbent && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">현직</span>
            )}
            {hasArticles && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40 font-medium tabular-nums">
                <Newspaper className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
                {candidate.articles.length}
              </span>
            )}
          </div>
          <SentimentMeter score={candidate.avgSentimentScore} />
        </div>
      </div>

      {hasArticles && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-[10px] text-cyan-400/60 hover:text-cyan-400 transition w-full"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            관련 뉴스 ({candidate.articles.length})
          </button>

          {expanded && (
            <div className="mt-1.5 space-y-1.5 border-t border-white/5 pt-2">
              {candidate.articles.map((article, idx) => (
                <div key={idx} className="rounded-md bg-white/[0.02] px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <MentionTypeBadge type={article.mentionType} />
                    <div className="flex-1 min-w-0">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-white/70 hover:text-cyan-400 transition line-clamp-1 flex items-center gap-1"
                      >
                        {article.title}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0 text-white/20" />
                      </a>
                      <ParsedContext context={article.context} />
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {article.publishedAt && (
                        <span className="text-[9px] text-white/20 tabular-nums">{formatDate(article.publishedAt)}</span>
                      )}
                      <SentimentBadge sentiment={article.sentiment} />
                    </div>
                  </div>
                  {article.sentimentScore != null && (
                    <div className="mt-1">
                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            article.sentimentScore > 0.2 ? "bg-emerald-400" : article.sentimentScore < -0.2 ? "bg-red-400" : "bg-amber-400"
                          }`}
                          style={{ width: `${Math.round((article.sentimentScore + 1) * 50)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── District detail view (구/군/시 level) ───
function DistrictDetail({ district, province, onBack }: { district: District; province: Province; onBack: () => void }) {
  const [detailData, setDetailData] = useState<DistrictDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetailData(null);

    fetch(`/api/election/district-detail?district_code=${encodeURIComponent(district.code)}`)
      .then((res) => res.json())
      .then((data: DistrictDetailData) => {
        if (!cancelled) setDetailData(data);
      })
      .catch((err) => {
        console.error("Failed to fetch district detail:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [district.code]);

  const maxPct = district.candidates.length > 0
    ? Math.max(...district.candidates.map(c => c.percentage), 1)
    : 1;
  const hasPollData = district.pollPct[0] > 0 || district.pollPct[1] > 0;

  // Merge enriched candidates with basic district candidate data
  const enrichedCandidates = detailData?.candidates ?? [];
  const enrichedIssues = detailData?.issues ?? [];

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
          {district.population > 0 && (
            <div className="rounded-md bg-white/5 px-2 py-1.5 text-center">
              <div className="font-data text-sm font-bold text-white/90">{(district.population / 10000).toFixed(1)}만</div>
              <div className="text-[10px] text-white/30">인구</div>
            </div>
          )}
          {hasPollData && (
            <div className="rounded-md bg-white/5 px-2 py-1.5 text-center">
              <div className="font-data text-sm font-bold text-white/90">{(district.pollPct[0] - district.pollPct[1]).toFixed(1)}%p</div>
              <div className="text-[10px] text-white/30">격차</div>
            </div>
          )}
          {district.candidates.length > 0 && (
            <div className="rounded-md bg-white/5 px-2 py-1.5 text-center">
              <div className="font-data text-sm font-bold text-white/90">{district.candidates.length}</div>
              <div className="text-[10px] text-white/30">후보</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-5">
        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="h-4 w-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span className="ml-2 text-[11px] text-white/30">상세 데이터 로딩 중...</span>
          </div>
        )}

        {/* Poll results - only show if we have actual percentages */}
        {hasPollData && district.candidates.length > 0 && (
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
        )}

        {/* Candidates - dashboard when enriched data is loaded */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">후보 분석 대시보드</h3>
          {enrichedCandidates.length > 0 ? (
            <div className="space-y-3">
              {enrichedCandidates.map((cand, idx) => (
                <CandidateDashboard key={cand.id} candidate={cand} defaultExpanded={idx === 0} />
              ))}
            </div>
          ) : (
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
                      {cand.percentage > 0 && (
                        <div className="font-data text-[11px] text-white/40 mt-0.5">지지율 {cand.percentage}%</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Issues - enriched when data is loaded */}
        {(enrichedIssues.length > 0 || district.issues.length > 0) && (
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
            지역 현안
            {enrichedIssues.length > 0 && (
              <span className="ml-2 text-[9px] text-white/20 normal-case">{enrichedIssues.length}건</span>
            )}
          </h3>
          {enrichedIssues.length > 0 ? (
            <EnrichedIssuesSection issues={enrichedIssues} />
          ) : (
            <DistrictIssuesSection issues={district.issues} />
          )}
        </section>
        )}

        {/* News section for district */}
        <section>
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">{district.name} 최근 뉴스</h3>
          <NewsFeedMini provinceCode={district.provinceCode} districtName={district.name} limit={10} />
        </section>
      </div>
    </div>
  );
}

// ─── Province overview with district list ───
function ProvinceDetail({ province, onDistrictClick }: { province: Province; onDistrictClick: (d: District) => void }) {
  const { getDistrictsByProvince } = useElection();
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

      <div className="flex-1 p-4 space-y-4">
        {/* ── 2단 레이아웃: 왼쪽 기초자치단체 | 오른쪽 이슈+뉴스 ── */}
        <div className="flex gap-4">
          {/* 왼쪽: 기초자치단체 목록 */}
          {districtList.length > 0 && (
            <div className="w-[45%] shrink-0">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                기초자치단체 ({districtList.length}개)
                <span className="ml-2 text-[9px] text-cyan-400/50 normal-case">클릭하여 상세보기</span>
              </h3>
              <div className="space-y-1 max-h-[400px] overflow-y-auto custom-dark-scrollbar pr-1">
                {districtList
                  .sort((a, b) => b.population - a.population)
                  .map((dist) => {
                    const gap = dist.pollPct[0] - dist.pollPct[1];
                    return (
                      <button
                        key={dist.code}
                        onClick={() => onDistrictClick(dist)}
                        className="w-full flex items-center gap-2 rounded-md bg-white/[0.03] border border-white/5 px-2.5 py-1.5 hover:bg-white/[0.06] hover:border-white/10 transition text-left group"
                      >
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: PARTIES[dist.leadingParty].color }} />
                        <span className="flex-1 text-[11px] font-medium text-white/70 group-hover:text-white/90">{dist.name}</span>
                        <div className="flex items-center gap-1">
                          {dist.candidates[0] ? (
                            <span className="font-data text-[10px] font-bold" style={{ color: PARTIES[dist.leadingParty].textColor }}>
                              {dist.candidates[0].name}
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30">{PARTIES[dist.leadingParty].name}</span>
                          )}
                        </div>
                        <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-cyan-400 transition shrink-0" />
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 오른쪽: 이슈 + 뉴스 */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* 이슈 - 카테고리별 그룹 */}
            {province.issues.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                  주요 이슈
                  <span className="ml-2 text-[9px] text-white/20 normal-case">{province.issues.length}건</span>
                </h3>
                <div className="max-h-[180px] overflow-y-auto custom-dark-scrollbar pr-1">
                  <IssuesSection issues={province.issues} limit={15} />
                </div>
              </div>
            )}

            {/* 최근 뉴스 */}
            <div>
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">최근 뉴스</h3>
              <div className="max-h-[220px] overflow-y-auto custom-dark-scrollbar pr-1">
                <NewsFeedMini provinceCode={province.code} limit={8} />
              </div>
            </div>
          </div>
        </div>

        {/* ── 아래: 여론조사 + 후보 ── */}

        {/* Latest poll - province level */}
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
          <div className="grid grid-cols-2 gap-2">
            {province.candidates.map((cand) => (
              <div key={cand.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                    {cand.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        href={`/local-election/candidate/${cand.id}`}
                        className="text-sm font-semibold text-white/90 hover:text-cyan-400 transition"
                      >
                        {cand.name}
                      </Link>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: PARTIES[cand.party].lightColor, color: PARTIES[cand.party].textColor }}>
                        {PARTIES[cand.party].name}
                      </span>
                      {cand.incumbent && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">현직</span>}
                    </div>
                    <div className="text-[10px] text-white/30 truncate">{cand.career[0]}</div>
                  </div>
                </div>
                {cand.pledges.length > 0 && (
                  <div className="space-y-0.5">
                    {cand.pledges.slice(0, 2).map((p, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px] text-white/50">
                        <span className="text-cyan-400/60 mt-0.5">•</span>
                        <span className="leading-tight line-clamp-1">{p}</span>
                      </div>
                    ))}
                  </div>
                )}
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
          <div className="text-4xl mb-3 opacity-20">&#x1F5FA;</div>
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
