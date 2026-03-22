"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ExternalLink,
  Quote,
  AtSign,
  BarChart3,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquareQuote,
  Target,
  Lightbulb,
} from "lucide-react";
import {
  PARTIES,
  type PartyId,
} from "@/lib/election-types";
import type {
  DistrictCandidateDetail,
  DistrictCandidateArticle,
} from "@/lib/election-queries";

// ── Types ──

interface TopicStats {
  topic: string;
  count: number;
  avgSentiment: number;
}

interface DateGroup {
  label: string;
  articles: DistrictCandidateArticle[];
}

// ── Constants ──

const SENTIMENT_THRESHOLDS = { positive: 0.2, negative: -0.2 } as const;

// ── Helpers ──

function classifySentiment(score: number | undefined | null): "positive" | "negative" | "neutral" {
  if (score == null) return "neutral";
  if (score > SENTIMENT_THRESHOLDS.positive) return "positive";
  if (score < SENTIMENT_THRESHOLDS.negative) return "negative";
  return "neutral";
}

function sentimentColor(score: number | undefined | null): string {
  const cls = classifySentiment(score);
  if (cls === "positive") return "#34d399";
  if (cls === "negative") return "#f87171";
  return "#9ca3af";
}

function sentimentBg(cls: "positive" | "negative" | "neutral"): string {
  if (cls === "positive") return "bg-emerald-400/10 text-emerald-400";
  if (cls === "negative") return "bg-red-400/10 text-red-400";
  return "bg-white/5 text-white/40";
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  } catch {
    return "";
  }
}

function getDateGroupLabel(dateStr: string): string {
  if (!dateStr) return "날짜 없음";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "오늘";
    if (diffDays === 1) return "어제";
    if (diffDays <= 7) return "이번 주";
    return "이전";
  } catch {
    return "날짜 없음";
  }
}

// ── Extract topics from article context and keywords ──

function extractTopics(articles: DistrictCandidateArticle[]): TopicStats[] {
  const topicMap = new Map<string, { count: number; totalSentiment: number; sentimentCount: number }>();

  for (const art of articles) {
    const topics: string[] = [];

    // Extract bracketed topics from context: [정책], [경제], etc.
    const bracketMatches = art.context.match(/\[([^\]]{2,12})\]/g);
    if (bracketMatches) {
      for (const m of bracketMatches) {
        const topic = m.slice(1, -1);
        // Filter out common analysis section headers
        if (!["정치적 의도", "정책 입장", "핵심 발언", "맥락"].includes(topic)) {
          topics.push(topic);
        }
      }
    }

    // Extract key phrases from title (2-4 char Korean noun phrases)
    const titlePhrases = art.title.match(/[가-힣]{2,4}(?=\s|,|·|$)/g);
    if (titlePhrases && topics.length === 0) {
      // Only use title phrases if no bracket topics found
      topics.push(...titlePhrases.slice(0, 2));
    }

    // Fallback: use mention type as topic category
    if (topics.length === 0) {
      const typeMap: Record<string, string> = {
        direct_quote: "발언",
        analysis: "분석",
        mention: "언급",
      };
      topics.push(typeMap[art.mentionType] || "일반");
    }

    for (const topic of topics) {
      const existing = topicMap.get(topic) || { count: 0, totalSentiment: 0, sentimentCount: 0 };
      existing.count += 1;
      if (art.sentimentScore != null) {
        existing.totalSentiment += art.sentimentScore;
        existing.sentimentCount += 1;
      }
      topicMap.set(topic, existing);
    }
  }

  return Array.from(topicMap.entries())
    .map(([topic, stats]) => ({
      topic,
      count: stats.count,
      avgSentiment: stats.sentimentCount > 0 ? stats.totalSentiment / stats.sentimentCount : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// ── Group articles by date ──

function groupArticlesByDate(articles: DistrictCandidateArticle[]): DateGroup[] {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt || "").getTime() - new Date(a.publishedAt || "").getTime()
  );

  const groupOrder = ["오늘", "어제", "이번 주", "이전", "날짜 없음"];
  const groupMap = new Map<string, DistrictCandidateArticle[]>();

  for (const art of sorted) {
    const label = getDateGroupLabel(art.publishedAt || "");
    const list = groupMap.get(label) || [];
    list.push(art);
    groupMap.set(label, list);
  }

  return groupOrder
    .filter((label) => groupMap.has(label))
    .map((label) => ({ label, articles: groupMap.get(label)! }));
}

// ── Parse context sections ──

function parseContextSections(context: string): {
  intent?: string;
  policy?: string;
  quote?: string;
  plain?: string;
} {
  if (!context) return {};

  const intentMatch = context.match(/\[정치적 의도\]\s*([\s\S]*?)(?=\[|$)/);
  const policyMatch = context.match(/\[정책 입장\]\s*([\s\S]*?)(?=\[|$)/);
  const quoteMatch = context.match(/\[핵심 발언\]\s*([\s\S]*?)(?=\[|$)/);

  if (!intentMatch && !policyMatch && !quoteMatch) {
    return { plain: context };
  }

  return {
    intent: intentMatch?.[1]?.trim() || undefined,
    policy: policyMatch?.[1]?.trim() || undefined,
    quote: quoteMatch?.[1]?.trim() || undefined,
  };
}

// ═══════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════

// ── Sentiment Gauge (circular arc) ──

function SentimentGauge({ score, size = 56 }: { score: number | null; size?: number }) {
  if (score === null) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-white/10"
        style={{ width: size, height: size }}
      >
        <span className="text-[9px] text-white/20">N/A</span>
      </div>
    );
  }

  const radius = (size - 8) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * radius; // half circle
  // Map score from [-1, 1] to [0, 1]
  const normalizedScore = (score + 1) / 2;
  const strokeDashoffset = circumference * (1 - normalizedScore);

  const color = sentimentColor(score);
  const label = score > SENTIMENT_THRESHOLDS.positive
    ? "긍정"
    : score < SENTIMENT_THRESHOLDS.negative
    ? "부정"
    : "중립";

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
          {score > 0 ? "+" : ""}{score.toFixed(2)}
        </span>
        <span className="text-[8px] text-white/30">{label}</span>
      </div>
    </div>
  );
}

// ── Stats row ──

function StatsRow({ articles }: { articles: DistrictCandidateArticle[] }) {
  const counts = useMemo(() => {
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    for (const a of articles) {
      const cls = classifySentiment(a.sentimentScore);
      if (cls === "positive") positive++;
      else if (cls === "negative") negative++;
      else neutral++;
    }
    return { total: articles.length, positive, negative, neutral };
  }, [articles]);

  return (
    <div className="flex items-center gap-3 text-[10px]">
      <span className="text-white/50">
        총 <span className="font-bold text-white/80 tabular-nums">{counts.total}</span>건
      </span>
      <span className="text-emerald-400/70">
        긍정 <span className="font-bold tabular-nums">{counts.positive}</span>
      </span>
      <span className="text-red-400/70">
        부정 <span className="font-bold tabular-nums">{counts.negative}</span>
      </span>
      <span className="text-white/30">
        중립 <span className="font-bold tabular-nums">{counts.neutral}</span>
      </span>
    </div>
  );
}

// ── Sentiment Timeline (SVG mini chart) ──

function SentimentTimeline({ articles }: { articles: DistrictCandidateArticle[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dataPoints = useMemo(() => {
    return articles
      .filter((a) => a.publishedAt && a.sentimentScore != null)
      .map((a) => ({
        date: a.publishedAt!,
        score: a.sentimentScore!,
        title: a.title,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [articles]);

  if (dataPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 rounded-md bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-white/20">데이터 부족 (최소 2건 필요)</span>
      </div>
    );
  }

  const W = 320;
  const H = 64;
  const padX = 12;
  const padY = 8;

  const minDate = new Date(dataPoints[0].date).getTime();
  const maxDate = new Date(dataPoints[dataPoints.length - 1].date).getTime();
  const dateRange = maxDate - minDate || 1;

  const points = dataPoints.map((dp, i) => {
    const x = padX + ((new Date(dp.date).getTime() - minDate) / dateRange) * (W - 2 * padX);
    const y = padY + ((1 - dp.score) / 2) * (H - 2 * padY);
    return { x, y, ...dp, idx: i };
  });

  // Build line path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-16"
        preserveAspectRatio="none"
      >
        {/* Zero line */}
        <line
          x1={padX}
          y1={H / 2}
          x2={W - padX}
          y2={H / 2}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.5"
          strokeDasharray="3,3"
        />
        {/* Y axis labels */}
        <text x="2" y={padY + 3} className="text-[6px]" fill="rgba(255,255,255,0.15)">+1</text>
        <text x="4" y={H / 2 + 2} className="text-[6px]" fill="rgba(255,255,255,0.15)">0</text>
        <text x="3" y={H - padY + 4} className="text-[6px]" fill="rgba(255,255,255,0.15)">-1</text>

        {/* Connection line */}
        <path
          d={linePath}
          fill="none"
          stroke="rgba(103,232,249,0.2)"
          strokeWidth="1"
        />

        {/* Dots */}
        {points.map((p) => (
          <g key={p.idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === p.idx ? 4 : 2.5}
              fill={sentimentColor(p.score)}
              className="transition-all duration-150 cursor-pointer"
              onMouseEnter={() => setHoveredIdx(p.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ filter: hoveredIdx === p.idx ? "drop-shadow(0 0 3px rgba(103,232,249,0.4))" : "none" }}
            />
          </g>
        ))}
      </svg>

      {/* Date axis labels */}
      <div className="flex justify-between px-3 -mt-0.5">
        <span className="text-[8px] text-white/15 tabular-nums">{formatDateShort(dataPoints[0].date)}</span>
        <span className="text-[8px] text-white/15 tabular-nums">{formatDateShort(dataPoints[dataPoints.length - 1].date)}</span>
      </div>

      {/* Hover tooltip */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          className="absolute z-20 bg-[#0d1220] border border-white/10 rounded-md px-2 py-1.5 pointer-events-none shadow-xl"
          style={{
            left: Math.min(Math.max(points[hoveredIdx].x - 80, 4), W - 164),
            top: -44,
            maxWidth: 200,
          }}
        >
          <div className="text-[9px] text-white/70 line-clamp-1">{points[hoveredIdx].title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[8px] text-white/30 tabular-nums">{formatDateFull(points[hoveredIdx].date)}</span>
            <span className="text-[9px] font-bold tabular-nums" style={{ color: sentimentColor(points[hoveredIdx].score) }}>
              {points[hoveredIdx].score > 0 ? "+" : ""}{points[hoveredIdx].score.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Issue Connection Map (horizontal bars) ──

function IssueConnectionMap({ articles }: { articles: DistrictCandidateArticle[] }) {
  const topics = useMemo(() => extractTopics(articles), [articles]);

  if (topics.length === 0) {
    return (
      <div className="flex items-center justify-center h-10 rounded-md bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-white/20">추출된 주제 없음</span>
      </div>
    );
  }

  const maxCount = Math.max(...topics.map((t) => t.count), 1);

  return (
    <div className="space-y-1.5">
      {topics.map((t) => (
        <div key={t.topic} className="flex items-center gap-2">
          <span className="w-14 text-right text-[10px] text-white/50 truncate shrink-0">{t.topic}</span>
          <div className="flex-1 h-4 bg-white/[0.03] rounded overflow-hidden relative">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${(t.count / maxCount) * 100}%`,
                backgroundColor: sentimentColor(t.avgSentiment),
                opacity: 0.5,
              }}
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-white/40 tabular-nums font-medium">
              {t.count}건
            </span>
          </div>
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: sentimentColor(t.avgSentiment) }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Key Quotes / Highlights Section ──

function KeyHighlights({ articles }: { articles: DistrictCandidateArticle[] }) {
  const highlights = useMemo(() => {
    const quotes: { text: string; source: string; sentiment?: number }[] = [];
    const intents: { text: string; source: string }[] = [];
    const policies: { text: string; source: string }[] = [];

    for (const art of articles) {
      const parsed = parseContextSections(art.context);

      if (art.mentionType === "direct_quote" && parsed.quote) {
        quotes.push({ text: parsed.quote, source: art.title, sentiment: art.sentimentScore });
      }

      if (parsed.intent) {
        intents.push({ text: parsed.intent, source: art.title });
      }
      if (parsed.policy) {
        policies.push({ text: parsed.policy, source: art.title });
      }
    }

    return { quotes: quotes.slice(0, 3), intents: intents.slice(0, 3), policies: policies.slice(0, 3) };
  }, [articles]);

  const hasContent = highlights.quotes.length > 0 || highlights.intents.length > 0 || highlights.policies.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-2">
      {/* Direct quotes */}
      {highlights.quotes.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquareQuote className="h-3 w-3 text-cyan-400/50" />
            <span className="text-[9px] font-semibold text-cyan-400/70 uppercase tracking-wider">핵심 발언</span>
          </div>
          {highlights.quotes.map((q, i) => (
            <div
              key={i}
              className="rounded-md bg-cyan-400/[0.04] border border-cyan-400/10 px-3 py-2"
            >
              <p className="text-[11px] text-white/60 leading-relaxed italic line-clamp-2">
                &ldquo;{q.text}&rdquo;
              </p>
              <span className="text-[9px] text-white/20 mt-1 block">{q.source}</span>
            </div>
          ))}
        </div>
      )}

      {/* Political intent */}
      {highlights.intents.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="h-3 w-3 text-amber-400/50" />
            <span className="text-[9px] font-semibold text-amber-400/70 uppercase tracking-wider">정치적 의도</span>
          </div>
          {highlights.intents.map((item, i) => (
            <div key={i} className="rounded-md bg-amber-400/[0.04] border border-amber-400/10 px-3 py-2">
              <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{item.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Policy positions */}
      {highlights.policies.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-purple-400/50" />
            <span className="text-[9px] font-semibold text-purple-400/70 uppercase tracking-wider">정책 입장</span>
          </div>
          {highlights.policies.map((item, i) => (
            <div key={i} className="rounded-md bg-purple-400/[0.04] border border-purple-400/10 px-3 py-2">
              <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mention type badge ──

function MentionBadge({ type }: { type: string }) {
  const config: Record<string, { icon: typeof Quote; label: string; cls: string }> = {
    direct_quote: { icon: Quote, label: "인용", cls: "text-cyan-400 bg-cyan-400/10" },
    mention: { icon: AtSign, label: "언급", cls: "text-amber-400 bg-amber-400/10" },
    analysis: { icon: BarChart3, label: "분석", cls: "text-purple-400 bg-purple-400/10" },
  };
  const c = config[type] || config.mention;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full font-medium ${c.cls}`}>
      <Icon className="h-2 w-2" />
      {c.label}
    </span>
  );
}

// ── Article Timeline (grouped by date) ──

function ArticleTimeline({ articles }: { articles: DistrictCandidateArticle[] }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupArticlesByDate(articles), [articles]);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  if (articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-12 rounded-md bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-white/20">관련 기사 없음</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.label);
        return (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center gap-1.5 w-full text-left mb-1 group"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-white/40 transition" />
              ) : (
                <ChevronDown className="h-3 w-3 text-white/20 group-hover:text-white/40 transition" />
              )}
              <span className="text-[9px] font-semibold text-white/30 group-hover:text-white/50 transition uppercase tracking-wider">
                {group.label}
              </span>
              <span className="text-[8px] text-white/15 tabular-nums">{group.articles.length}</span>
            </button>

            {!isCollapsed && (
              <div className="space-y-1 ml-1">
                {group.articles.map((art, idx) => {
                  const sentCls = classifySentiment(art.sentimentScore);
                  const borderColor =
                    sentCls === "positive"
                      ? "border-l-emerald-400/40"
                      : sentCls === "negative"
                      ? "border-l-red-400/40"
                      : "border-l-white/10";

                  return (
                    <a
                      key={idx}
                      href={art.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block rounded-md bg-white/[0.02] hover:bg-white/[0.05] border-l-2 ${borderColor} px-3 py-2 transition group/article`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-white/70 group-hover/article:text-cyan-400 transition line-clamp-1">
                              {art.title}
                            </span>
                            <ExternalLink className="h-2.5 w-2.5 text-white/15 group-hover/article:text-cyan-400/50 shrink-0 transition" />
                          </div>
                          {art.context && (
                            <p className="text-[10px] text-white/30 leading-relaxed mt-0.5 line-clamp-1">
                              {art.context.replace(/\[[^\]]+\]\s*/g, "").slice(0, 80)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {art.publishedAt && (
                            <span className="text-[8px] text-white/15 tabular-nums">
                              {formatDateShort(art.publishedAt)}
                            </span>
                          )}
                          <MentionBadge type={art.mentionType} />
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Main: CandidateDashboard
// ═══════════════════════════════════════════════════

interface CandidateDashboardProps {
  candidate: DistrictCandidateDetail;
  defaultExpanded?: boolean;
}

export default function CandidateDashboard({ candidate, defaultExpanded = false }: CandidateDashboardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const party = PARTIES[candidate.party] || PARTIES.ind;
  const hasArticles = candidate.articles.length > 0;

  // Sentiment trend direction
  const trendDirection = useMemo(() => {
    const scored = candidate.articles
      .filter((a) => a.publishedAt && a.sentimentScore != null)
      .sort((a, b) => new Date(a.publishedAt!).getTime() - new Date(b.publishedAt!).getTime());

    if (scored.length < 3) return "stable";
    const recent = scored.slice(-3);
    const older = scored.slice(0, Math.max(scored.length - 3, 1));
    const recentAvg = recent.reduce((sum, a) => sum + a.sentimentScore!, 0) / recent.length;
    const olderAvg = older.reduce((sum, a) => sum + a.sentimentScore!, 0) / older.length;
    const diff = recentAvg - olderAvg;
    if (diff > 0.15) return "rising";
    if (diff < -0.15) return "falling";
    return "stable";
  }, [candidate.articles]);

  const TrendIcon = trendDirection === "rising" ? TrendingUp : trendDirection === "falling" ? TrendingDown : Minus;
  const trendColor = trendDirection === "rising" ? "text-emerald-400" : trendDirection === "falling" ? "text-red-400" : "text-white/30";

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden transition-all duration-300">
      {/* ── 1. Candidate Header Bar ── */}
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-base font-bold shrink-0 ring-1 ring-white/10"
            style={{ background: party.lightColor, color: party.textColor }}
          >
            {candidate.name.charAt(0)}
          </div>

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white/90">{candidate.name}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: party.lightColor, color: party.textColor }}
              >
                {party.name}
              </span>
              {candidate.isIncumbent && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-medium">현직</span>
              )}
              {hasArticles && (
                <TrendIcon className={`h-3 w-3 ${trendColor}`} />
              )}
            </div>
            <StatsRow articles={candidate.articles} />
          </div>

          {/* Sentiment Gauge */}
          <SentimentGauge score={candidate.avgSentimentScore} size={52} />
        </div>
      </div>

      {/* ── 2. Sentiment Timeline (always visible if data) ── */}
      {hasArticles && (
        <div className="px-3 pb-2">
          <SentimentTimeline articles={candidate.articles} />
        </div>
      )}

      {/* Expand/collapse button */}
      {hasArticles && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 border-t border-white/5 text-[10px] text-cyan-400/50 hover:text-cyan-400 hover:bg-white/[0.02] transition"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" />
              접기
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              상세 분석 ({candidate.articles.length}건)
            </>
          )}
        </button>
      )}

      {/* ── Expanded sections ── */}
      {expanded && hasArticles && (
        <div className="border-t border-white/5 p-3 space-y-4">
          {/* 3. Issue Connection Map */}
          <section>
            <h4 className="text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">연관 주제 분석</h4>
            <IssueConnectionMap articles={candidate.articles} />
          </section>

          {/* 4. Key Highlights */}
          <KeyHighlights articles={candidate.articles} />

          {/* 5. Article Timeline */}
          <section>
            <h4 className="text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">기사 타임라인</h4>
            <ArticleTimeline articles={candidate.articles} />
          </section>
        </div>
      )}
    </div>
  );
}
