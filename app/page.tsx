import Link from "next/link";
import { cn } from "@/lib/utils";
import { ministers, agendas, hotTopics as mockHotTopics } from "@/lib/mock-data";
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS } from "@/lib/types";
import { StatsCard } from "@/components/dashboard/stats-card";
import { MinistryChart } from "@/components/dashboard/ministry-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  TrendingDown,
  Activity,
  Hash,
  MessageCircle,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// Supabase server-side fetch
async function getLiveStats() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const [
      { count: provinceCount },
      { count: candidateCount },
      { count: issueCount },
      { count: articleCount },
      { data: liveTopics },
    ] = await Promise.all([
      supabase.from("provinces").select("id", { count: "exact", head: true }),
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase.from("issues").select("id", { count: "exact", head: true }),
      supabase.from("raw_articles").select("id", { count: "exact", head: true }),
      supabase.from("hot_topics").select("*").order("count", { ascending: false }).limit(10),
    ]);

    return {
      kpiStats: [
        { label: "추적 시도", value: provinceCount ?? 0, change: 0, changeLabel: "전국 17개 시도", icon: "map" },
        { label: "수집 후보자", value: candidateCount ?? 0, change: 0, changeLabel: "실시간 수집", icon: "users" },
        { label: "발견 이슈", value: issueCount ?? 0, change: 0, changeLabel: "지역 이슈", icon: "alert" },
        { label: "수집 뉴스", value: articleCount ?? 0, change: 0, changeLabel: "원본 기사", icon: "newspaper" },
      ],
      hotTopics: (liveTopics ?? []).map((t) => ({
        id: t.id,
        keyword: t.keyword,
        count: t.count ?? 0,
        trend: (t.trend === "up" || t.trend === "new" ? "rising" : t.trend === "down" ? "falling" : "steady") as "rising" | "falling" | "steady",
        relatedMinistry: t.related_ministry ?? "",
        category: t.category ?? "",
      })),
    };
  } catch {
    return null;
  }
}

// Prepare chart data
const chartData = ministers.map((m) => ({
  ministry: m.ministry.replace("부", "").slice(0, 5),
  rate: m.fulfillmentRate,
}));

// Top 4 ministers by tracked agendas
const topMinisters = [...ministers]
  .sort((a, b) => b.trackedAgendas - a.trackedAgendas)
  .slice(0, 4);

// Recent agendas (first 8)
const recentAgendas = agendas.slice(0, 8);

const trendIcons = {
  up: <TrendingUp className="h-3.5 w-3.5 text-success" />,
  down: <TrendingDown className="h-3.5 w-3.5 text-destructive" />,
  stable: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
};

const topicTrendIcons = {
  rising: <ArrowUpRight className="h-3.5 w-3.5 text-success" />,
  falling: <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />,
  steady: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default async function DashboardPage() {
  // Fetch live stats from Supabase (server-side)
  const live = await getLiveStats();
  const kpiStats = live?.kpiStats ?? [
    { label: "추적 시도", value: 17, change: 0, changeLabel: "전국", icon: "map" },
    { label: "수집 후보자", value: 0, change: 0, changeLabel: "-", icon: "users" },
    { label: "발견 이슈", value: 0, change: 0, changeLabel: "-", icon: "alert" },
    { label: "수집 뉴스", value: 0, change: 0, changeLabel: "-", icon: "newspaper" },
  ];
  const topHotTopics = (live?.hotTopics?.length ?? 0) > 0
    ? live!.hotTopics.slice(0, 8)
    : mockHotTopics.slice(0, 8);
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          국무회의 안건 추적 및 시민 감시 현황
        </p>
      </div>

      {/* Election banner */}
      <Link
        href="/local-election"
        className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-red-500/20 bg-gradient-to-r from-red-950/40 via-slate-900/60 to-blue-950/40 p-4 transition-all hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
          <MapPin className="h-5 w-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">제9회 전국동시지방선거 관제탑</span>
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">LIVE</span>
          </div>
          <p className="mt-0.5 text-xs text-white/50">
            17개 시·도 · 226개 시·군·구 단위 여론조사 · 후보 정보 · 지역 이슈 실시간 추적
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-white/40 group-hover:text-red-400 transition-colors">
          <span>관제탑 열기</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Top row - 4 KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiStats.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            change={stat.change}
            changeLabel={stat.changeLabel}
            icon={stat.icon}
          />
        ))}
      </div>

      {/* Middle row - 60/40 split */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[3fr_2fr]">
        {/* LEFT: Recent agenda feed */}
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              최근 안건 피드
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0">
              {recentAgendas.map((agenda, index) => (
                <div key={agenda.id}>
                  {index > 0 && <Separator className="my-2.5" />}
                  <div className="flex items-start gap-3 py-1">
                    {/* Status badge */}
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0",
                        STATUS_COLORS[agenda.status]
                      )}
                    >
                      {STATUS_LABELS[agenda.status]}
                    </Badge>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate">
                        {agenda.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {agenda.ministry}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50">
                          |
                        </span>
                        <span className="font-data text-[11px] text-muted-foreground">
                          {agenda.date}
                        </span>
                      </div>
                    </div>

                    {/* Priority */}
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        agenda.priority === "high" &&
                          "bg-destructive/10 text-destructive",
                        agenda.priority === "medium" &&
                          "bg-warning/10 text-warning",
                        agenda.priority === "low" &&
                          "bg-muted text-muted-foreground"
                      )}
                    >
                      {PRIORITY_LABELS[agenda.priority]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Key ministers 2x2 grid */}
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              핵심 국무위원
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topMinisters.map((minister) => (
                <Link
                  key={minister.id}
                  href={`/ministers/${minister.id}`}
                  className="group rounded-lg border border-border/60 p-3 transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/8 text-primary text-[10px] font-semibold">
                        {minister.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">
                        {minister.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">
                        {minister.ministry}
                      </p>
                    </div>
                    <div className="ml-auto">
                      {trendIcons[minister.trend]}
                    </div>
                  </div>

                  {/* Fulfillment rate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        이행률
                      </span>
                      <span className="font-data text-xs font-semibold text-foreground">
                        {minister.fulfillmentRate}%
                      </span>
                    </div>
                    <Progress value={minister.fulfillmentRate} />
                  </div>

                  {/* Recent activity */}
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {minister.recentActivity}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row - 50/50 split */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* LEFT: Ministry fulfillment chart */}
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              부처별 이행률
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MinistryChart data={chartData} />
          </CardContent>
        </Card>

        {/* RIGHT: Hot keywords */}
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" />
              핫 키워드
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0">
              {topHotTopics.map((topic, index) => (
                <div key={topic.id}>
                  {index > 0 && <Separator className="my-2" />}
                  <div className="flex items-center gap-3 py-1">
                    {/* Rank */}
                    <span
                      className={cn(
                        "font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                        index < 3
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>

                    {/* Keyword */}
                    <span className="flex-1 text-sm font-medium">
                      {topic.keyword}
                    </span>

                    {/* Related ministry */}
                    <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[100px]">
                      {topic.relatedMinistry}
                    </span>

                    {/* Count */}
                    <span className="font-data text-xs text-muted-foreground tabular-nums">
                      {topic.count}회
                    </span>

                    {/* Trend */}
                    {topicTrendIcons[topic.trend]}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
