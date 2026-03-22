"use client";

import { useState, useEffect } from "react";
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Quote,
  AtSign,
  BarChart3,
} from "lucide-react";
import { PARTIES, type ArticleSummary, type TrendSignal } from "@/lib/election-types";

interface Props {
  provinceCode?: string;
  districtName?: string;
  candidateId?: string;
  limit?: number;
}

// ── Sentiment indicator with bar ──

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

// ── Relevance score badge ──

function RelevanceBadge({ score }: { score?: number }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const cls = pct >= 80 ? "text-cyan-400" : pct >= 50 ? "text-white/50" : "text-white/25";
  return (
    <span className={`text-[9px] font-data font-bold ${cls}`}>
      {pct}%
    </span>
  );
}

// ── Mention type icon ──

function MentionIcon({ type }: { type: string }) {
  switch (type) {
    case "direct_quote":
      return <Quote className="h-2.5 w-2.5 text-cyan-400/60" />;
    case "analysis":
      return <BarChart3 className="h-2.5 w-2.5 text-purple-400/60" />;
    default:
      return <AtSign className="h-2.5 w-2.5 text-white/30" />;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function SkeletonItem() {
  return (
    <div className="animate-pulse rounded-md bg-white/[0.03] p-3 space-y-2">
      <div className="h-3.5 bg-white/10 rounded w-3/4" />
      <div className="h-8 bg-white/5 rounded w-full" />
      <div className="flex gap-2">
        <div className="h-2.5 bg-white/5 rounded w-16" />
        <div className="h-2.5 bg-white/5 rounded w-20" />
      </div>
    </div>
  );
}

export default function NewsFeedMini({ provinceCode, districtName, candidateId, limit = 5 }: Props) {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchNews() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (candidateId) params.set("candidate", candidateId);
        else if (districtName) {
          if (provinceCode) params.set("province", provinceCode);
          params.set("district", districtName);
        }
        else if (provinceCode) params.set("province", provinceCode);
        else return;

        params.set("limit", String(limit));

        const res = await fetch(`/api/election/news?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ArticleSummary[] = await res.json();
        if (!cancelled) setArticles(data);
      } catch (err) {
        console.error("[NewsFeedMini] fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNews();
    return () => { cancelled = true; };
  }, [provinceCode, districtName, candidateId, limit]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonItem key={i} />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="rounded-md bg-white/[0.03] border border-white/5 p-4 text-center">
        <span className="text-xs text-white/30">관련 뉴스가 없습니다</span>
      </div>
    );
  }

  const visible = showAll ? articles : articles.slice(0, 5);

  return (
    <div className="space-y-2">
      {visible.map((article) => {
        const isExpanded = expandedId === article.id;

        return (
          <div
            key={article.id}
            className="rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition overflow-hidden"
          >
            {/* Header row */}
            <div className="px-3 pt-2.5 pb-1.5">
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
                  <RelevanceBadge score={article.relevanceScore} />
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 text-cyan-400/40 hover:text-cyan-400 transition" />
                  </a>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-white/30">{article.source}</span>
                {article.publishedAt && (
                  <>
                    <span className="text-[10px] text-white/15">|</span>
                    <span className="text-[10px] text-white/30">{formatDate(article.publishedAt)}</span>
                  </>
                )}
                <SentimentBar sentiment={article.sentiment} score={article.sentimentScore} />
              </div>
            </div>

            {/* Summary */}
            {article.summary && (
              <div className="px-3 py-1.5">
                <div className={`text-[11px] text-white/50 leading-relaxed ${isExpanded ? "" : "line-clamp-3"}`}>
                  {article.summary}
                </div>
              </div>
            )}

            {/* Panse impact section */}
            {article.panseImpact && (
              <div className="mx-3 mb-2 rounded-md bg-cyan-500/[0.07] border border-cyan-500/20 px-2.5 py-2">
                <div className="text-[10px] font-semibold text-cyan-400/80 mb-0.5">판세 영향</div>
                <div className={`text-[11px] text-cyan-100/60 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                  {article.panseImpact}
                </div>
              </div>
            )}

            {/* Trend detail (affected voter groups) */}
            {article.trendDetail && isExpanded && (
              <div className="mx-3 mb-2 text-[10px] text-white/40">
                <span className="font-medium text-white/50">영향 유권자:</span>{" "}
                {article.trendDetail}
              </div>
            )}

            {/* Keywords */}
            {article.keywords && article.keywords.length > 0 && (
              <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap">
                {article.keywords.slice(0, isExpanded ? undefined : 4).map((kw, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.1] transition cursor-default"
                  >
                    {kw}
                  </span>
                ))}
                {!isExpanded && article.keywords.length > 4 && (
                  <span className="text-[9px] text-white/20">+{article.keywords.length - 4}</span>
                )}
              </div>
            )}

            {/* Candidate mentions (expanded only) */}
            {isExpanded && article.candidateMentions && article.candidateMentions.length > 0 && (
              <div className="mx-3 mb-2 space-y-1">
                <div className="text-[10px] font-medium text-white/40">후보 언급</div>
                {article.candidateMentions.map((m, i) => (
                  <div key={i} className="flex items-start gap-1.5 rounded-md bg-white/[0.03] px-2 py-1.5">
                    <MentionIcon type={m.mentionType} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium" style={{ color: PARTIES[m.party].textColor }}>
                          {m.candidateName}
                        </span>
                        <span className={`text-[9px] ${m.sentimentScore > 0 ? "text-emerald-400" : m.sentimentScore < 0 ? "text-red-400" : "text-white/30"}`}>
                          {m.sentimentScore > 0 ? "+" : ""}{m.sentimentScore.toFixed(2)}
                        </span>
                      </div>
                      {m.context && (
                        <div className="text-[10px] text-white/35 leading-relaxed mt-0.5 line-clamp-2">
                          {m.context}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Expand/collapse toggle */}
            {(article.summary || article.panseImpact || (article.candidateMentions && article.candidateMentions.length > 0)) && (
              <button
                onClick={() => setExpandedId(isExpanded ? null : article.id)}
                className="w-full py-1.5 text-[10px] text-cyan-400/40 hover:text-cyan-400/70 transition border-t border-white/[0.03]"
              >
                {isExpanded ? "접기" : "상세보기"}
              </button>
            )}
          </div>
        );
      })}

      {!showAll && articles.length > 5 && (
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowAll(true);
          }}
          className="w-full rounded-md bg-white/[0.03] border border-white/5 py-2 text-[11px] text-cyan-400/60 hover:text-cyan-400 hover:bg-white/[0.05] transition"
        >
          더보기 ({articles.length - 5}건)
        </button>
      )}
    </div>
  );
}
