"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Briefcase,
  Quote,
  AtSign,
  BarChart3,
} from "lucide-react";
import { PARTIES, type CandidateDetail, type TrendSignal } from "@/lib/election-types";
import SentimentChart from "@/components/election/sentiment-chart";

// ── Sentiment bar ──

function SentimentBar({ sentiment, score }: { sentiment?: string; score?: number }) {
  if (!sentiment) return null;

  const config: Record<string, { label: string; cls: string; barCls: string }> = {
    positive: { label: "긍정", cls: "text-emerald-400", barCls: "bg-emerald-400" },
    negative: { label: "부정", cls: "text-red-400", barCls: "bg-red-400" },
    neutral: { label: "중립", cls: "text-white/50", barCls: "bg-white/30" },
    mixed: { label: "혼합", cls: "text-yellow-400", barCls: "bg-yellow-400" },
  };

  const c = config[sentiment] || config.neutral!;
  const displayScore = score != null ? Math.abs(score) : 0.5;

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[9px] font-semibold ${c.cls}`}>{c.label}</span>
      <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${c.barCls}`}
          style={{ width: `${Math.min(displayScore * 100, 100)}%`, opacity: 0.7 }}
        />
      </div>
      {score != null && (
        <span className="text-[9px] text-white/25 font-data">{score.toFixed(2)}</span>
      )}
    </div>
  );
}

// ── Trend signal badge ──

function TrendBadge({ signal }: { signal?: TrendSignal }) {
  if (!signal) return null;

  const config: Record<TrendSignal, { icon: React.ReactNode; cls: string; label: string }> = {
    rising: {
      icon: <TrendingUp className="h-3 w-3" />,
      cls: "bg-red-500/15 text-red-400",
      label: "상승",
    },
    falling: {
      icon: <TrendingDown className="h-3 w-3" />,
      cls: "bg-emerald-500/15 text-emerald-400",
      label: "하락",
    },
    stable: {
      icon: <Minus className="h-3 w-3" />,
      cls: "bg-white/10 text-white/50",
      label: "안정",
    },
    breaking: {
      icon: <Zap className="h-3 w-3" />,
      cls: "bg-red-500/20 text-red-400 animate-pulse",
      label: "속보",
    },
  };

  const c = config[signal];
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// ── Mention type icon ──

function MentionIcon({ type }: { type: string }) {
  switch (type) {
    case "direct_quote":
      return <Quote className="h-3.5 w-3.5 text-cyan-400/60" />;
    case "analysis":
      return <BarChart3 className="h-3.5 w-3.5 text-purple-400/60" />;
    default:
      return <AtSign className="h-3.5 w-3.5 text-white/30" />;
  }
}

function MentionTypeLabel({ type }: { type: string }) {
  switch (type) {
    case "direct_quote":
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium">직접 인용</span>;
    case "analysis":
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">분석</span>;
    default:
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 font-medium">언급</span>;
  }
}

// ── Parse context sections like [정치적 의도] and [정책 입장] ──

interface ContextSection {
  label: string;
  content: string;
}

function parseContextSections(context: string): { plain: string; sections: ContextSection[] } {
  if (!context) return { plain: "", sections: [] };

  const sectionRegex = /\[([^\]]+)\]\s*/g;
  const sections: ContextSection[] = [];
  let lastIdx = 0;
  let plain = "";
  const matches = [...context.matchAll(sectionRegex)];

  if (matches.length === 0) {
    return { plain: context, sections: [] };
  }

  // Text before first section
  if (matches[0].index! > 0) {
    plain = context.slice(0, matches[0].index!).trim();
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const label = match[1];
    const startContent = match.index! + match[0].length;
    const endContent = i < matches.length - 1 ? matches[i + 1].index! : context.length;
    const content = context.slice(startContent, endContent).trim();
    if (content) {
      sections.push({ label, content });
    }
  }

  return { plain, sections };
}

function ContextDisplay({ context }: { context: string }) {
  const { plain, sections } = parseContextSections(context);

  return (
    <div className="space-y-2">
      {plain && (
        <div className="text-[11px] text-white/50 leading-relaxed">{plain}</div>
      )}
      {sections.map((sec, i) => (
        <div key={i} className="rounded-md bg-white/[0.03] border border-white/[0.06] px-3 py-2">
          <div className="text-[10px] font-semibold text-cyan-400/70 mb-0.5">{sec.label}</div>
          <div className="text-[11px] text-white/50 leading-relaxed">{sec.content}</div>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-white/10 rounded w-24" />
          <div className="flex gap-4">
            <div className="h-20 w-20 rounded-full bg-white/10" />
            <div className="space-y-3 flex-1">
              <div className="h-6 bg-white/10 rounded w-48" />
              <div className="h-4 bg-white/5 rounded w-64" />
              <div className="h-3 bg-white/5 rounded w-40" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/election/candidate/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("후보를 찾을 수 없습니다");
          throw new Error(`HTTP ${res.status}`);
        }
        const data: CandidateDetail = await res.json();
        if (!cancelled) setCandidate(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "오류 발생");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <LoadingSkeleton />;

  if (error || !candidate) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-sm text-red-400">{error || "데이터를 불러올 수 없습니다"}</div>
          <Link
            href="/local-election"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            선거 지도로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const party = PARTIES[candidate.party];
  const positionLabel = candidate.districtName
    ? `${candidate.provinceName} ${candidate.districtName}`
    : candidate.provinceName || "";

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
        {/* Back nav + region label */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/local-election"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400/70 hover:text-cyan-400 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            뒤로가기
          </Link>
          {positionLabel && (
            <span className="text-xs text-white/40 font-medium">
              {positionLabel} {candidate.districtName ? "기초단체장" : "광역단체장"}
            </span>
          )}
        </div>

        {/* Profile header */}
        <div className="rounded-xl bg-[#0d1220] border border-white/10 p-5 md:p-6 mb-5">
          <div className="flex items-start gap-4">
            <div
              className="h-16 w-16 md:h-20 md:w-20 rounded-full flex items-center justify-center text-2xl md:text-3xl font-bold shrink-0"
              style={{ background: party.lightColor, color: party.textColor }}
            >
              {candidate.name.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl md:text-2xl font-bold text-white">
                  {candidate.name}
                </h1>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: party.lightColor, color: party.textColor }}
                >
                  {party.name}
                </span>
                {candidate.incumbent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium">
                    현직
                  </span>
                )}
              </div>

              <div className="text-sm text-white/50">
                {candidate.incumbent ? "현직" : "후보"}{" "}
                {candidate.age > 0 && <span>· {candidate.age}세</span>}
              </div>

              {candidate.career.length > 0 && (
                <div className="text-xs text-white/40 mt-1 line-clamp-2">
                  {candidate.career.slice(0, 2).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pledges */}
        {candidate.pledges.length > 0 && (
          <section className="rounded-xl bg-[#0d1220] border border-white/10 p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-cyan-400/60" />
              <h2 className="text-sm font-semibold text-white/80">주요 공약</h2>
              <span className="text-[10px] text-white/30 ml-auto">{candidate.pledges.length}건</span>
            </div>
            <div className="space-y-2">
              {candidate.pledges.map((pledge, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] border border-white/5 px-3.5 py-2.5"
                >
                  <span className="font-data text-[11px] font-bold text-cyan-400/50 mt-0.5 shrink-0 w-5 text-right">
                    {i + 1}.
                  </span>
                  <span className="text-xs text-white/70 leading-relaxed">
                    {pledge}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related News with deep analysis */}
        <section className="rounded-xl bg-[#0d1220] border border-white/10 p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="h-4 w-4 text-cyan-400/60" />
            <h2 className="text-sm font-semibold text-white/80">관련 뉴스 분석</h2>
            {candidate.relatedNews.length > 0 && (
              <span className="text-[10px] text-white/30 ml-auto">
                {candidate.relatedNews.length}건
              </span>
            )}
          </div>

          {candidate.relatedNews.length === 0 ? (
            <div className="rounded-lg bg-white/[0.03] border border-white/5 p-6 text-center">
              <span className="text-xs text-white/30">관련 뉴스가 없습니다</span>
            </div>
          ) : (
            <div className="space-y-2">
              {candidate.relatedNews.map((article) => {
                const isExpanded = expandedArticle === article.id;

                return (
                  <div
                    key={article.id}
                    className="rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition overflow-hidden"
                  >
                    {/* Title + meta */}
                    <div className="px-3.5 pt-3 pb-1.5">
                      <div className="flex items-start gap-2">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 group"
                        >
                          <div className="text-xs font-medium text-white/80 group-hover:text-white leading-tight line-clamp-2 transition">
                            {article.title}
                          </div>
                        </a>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <TrendBadge signal={article.trendSignal} />
                          <a href={article.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 text-cyan-400/40 hover:text-cyan-400 transition" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-white/30">{article.source}</span>
                        {article.publishedAt && (
                          <>
                            <span className="text-[10px] text-white/15">|</span>
                            <span className="text-[10px] text-white/30">{formatDate(article.publishedAt)}</span>
                          </>
                        )}
                        <SentimentBar sentiment={article.sentiment} score={article.sentimentScore} />
                        {article.relevanceScore != null && (
                          <span className={`text-[9px] font-data font-bold ${article.relevanceScore >= 0.8 ? "text-cyan-400" : "text-white/30"}`}>
                            관련도 {Math.round(article.relevanceScore * 100)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    {article.summary && (
                      <div className="px-3.5 py-1.5">
                        <div className={`text-[11px] text-white/50 leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                          {article.summary}
                        </div>
                      </div>
                    )}

                    {/* Panse impact */}
                    {article.panseImpact && (
                      <div className="mx-3.5 mb-2 rounded-md bg-cyan-500/[0.07] border border-cyan-500/20 px-2.5 py-2">
                        <div className="text-[10px] font-semibold text-cyan-400/80 mb-0.5">판세 영향</div>
                        <div className={`text-[11px] text-cyan-100/60 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                          {article.panseImpact}
                        </div>
                      </div>
                    )}

                    {/* Expanded: trend detail, keywords, candidate mentions with context */}
                    {isExpanded && (
                      <div className="px-3.5 pb-2 space-y-2">
                        {/* Trend detail */}
                        {article.trendDetail && (
                          <div className="text-[10px] text-white/40">
                            <span className="font-medium text-white/50">영향 유권자:</span>{" "}
                            {article.trendDetail}
                          </div>
                        )}

                        {/* Keywords */}
                        {article.keywords && article.keywords.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {article.keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Candidate mentions with parsed context */}
                        {article.candidateMentions && article.candidateMentions.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[10px] font-medium text-white/40">후보 분석</div>
                            {article.candidateMentions.map((m, i) => (
                              <div key={i} className="rounded-md bg-white/[0.03] border border-white/[0.05] p-2.5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <MentionIcon type={m.mentionType} />
                                  <span className="text-[11px] font-medium" style={{ color: PARTIES[m.party].textColor }}>
                                    {m.candidateName}
                                  </span>
                                  <MentionTypeLabel type={m.mentionType} />
                                  <span className={`text-[9px] ml-auto font-data ${m.sentimentScore > 0 ? "text-emerald-400" : m.sentimentScore < 0 ? "text-red-400" : "text-white/30"}`}>
                                    감성 {m.sentimentScore > 0 ? "+" : ""}{m.sentimentScore.toFixed(2)}
                                  </span>
                                </div>
                                {m.context && (
                                  <ContextDisplay context={m.context} />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expand/collapse */}
                    {(article.summary || article.panseImpact || (article.candidateMentions && article.candidateMentions.length > 0)) && (
                      <button
                        onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                        className="w-full py-1.5 text-[10px] text-cyan-400/40 hover:text-cyan-400/70 transition border-t border-white/[0.03]"
                      >
                        {isExpanded ? "접기" : "상세 분석 보기"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Sentiment Trend */}
        {candidate.sentimentTrend.length > 0 && (
          <section className="rounded-xl bg-[#0d1220] border border-white/10 p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-cyan-400/60" />
              <h2 className="text-sm font-semibold text-white/80">여론 추이</h2>
              <span className="text-[10px] text-white/30 ml-auto">감성 분석 기반</span>
            </div>
            <SentimentChart data={candidate.sentimentTrend} />
            <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-white/30">
              <span>+1.0 = 매우 긍정</span>
              <span>0.0 = 중립</span>
              <span>-1.0 = 매우 부정</span>
            </div>
          </section>
        )}

        {/* Career / History */}
        {candidate.career.length > 0 && (
          <section className="rounded-xl bg-[#0d1220] border border-white/10 p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="h-4 w-4 text-cyan-400/60" />
              <h2 className="text-sm font-semibold text-white/80">이력</h2>
            </div>
            <div className="space-y-1.5">
              {candidate.career.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-md bg-white/[0.03] px-3.5 py-2"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-400/40 mt-1.5 shrink-0" />
                  <span className="text-xs text-white/60 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom navigation */}
        <div className="flex justify-center pt-4 pb-8">
          <Link
            href="/local-election"
            className="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] border border-white/10 px-5 py-2.5 text-xs text-white/60 hover:text-white hover:bg-white/[0.08] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            선거 지도로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
