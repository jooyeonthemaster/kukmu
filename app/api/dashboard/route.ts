import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    // Fetch all in parallel
    const [
      { data: agendas },
      { data: ministers },
      { data: hotTopics },
      { data: candidates },
      { data: issues },
      { data: rawArticles },
      { data: provinces },
    ] = await Promise.all([
      supabase
        .from("agendas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("ministers").select("*").order("fulfillment_rate", { ascending: false }),
      supabase
        .from("hot_topics")
        .select("*")
        .order("count", { ascending: false })
        .limit(10),
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase.from("issues").select("id", { count: "exact", head: true }),
      supabase.from("raw_articles").select("id", { count: "exact", head: true }),
      supabase.from("provinces").select("id", { count: "exact", head: true }),
    ]);

    // Map agendas to frontend type
    const mappedAgendas = (agendas ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      ministry: a.ministry,
      ministerName: a.minister_name ?? "",
      status: a.status ?? "proposed",
      date: a.date ?? new Date().toISOString().split("T")[0],
      category: a.category ?? "기타",
      priority: mapPriorityFromDb(a.priority),
      description: a.description ?? "",
    }));

    // Map ministers
    const mappedMinisters = (ministers ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      ministry: m.ministry,
      position: m.position ?? "",
      totalStatements: 0,
      fulfillmentRate: m.fulfillment_rate ?? 0,
      recentActivity: "",
      trend: m.trend ?? "stable",
      trackedAgendas: m.tracked_agendas ?? 0,
    }));

    // Map hot topics
    const mappedHotTopics = (hotTopics ?? []).map((t) => ({
      id: t.id,
      keyword: t.keyword,
      count: t.count ?? 0,
      trend: mapTrendFromDb(t.trend),
      relatedMinistry: t.related_ministry ?? "",
      category: t.category ?? "",
    }));

    // KPI stats
    const kpiStats = [
      {
        label: "추적 중인 시도",
        value: provinces?.length ?? 0,
        change: 0,
        changeLabel: "전국 17개 시도",
        icon: "map",
      },
      {
        label: "수집된 후보자",
        value: candidates?.length ?? 0,
        change: 0,
        changeLabel: "전체 후보자 수",
        icon: "users",
      },
      {
        label: "발견된 이슈",
        value: issues?.length ?? 0,
        change: 0,
        changeLabel: "지역 이슈",
        icon: "alert",
      },
      {
        label: "수집된 뉴스",
        value: rawArticles?.length ?? 0,
        change: 0,
        changeLabel: "원본 기사",
        icon: "newspaper",
      },
    ];

    return NextResponse.json({
      agendas: mappedAgendas,
      ministers: mappedMinisters,
      hotTopics: mappedHotTopics,
      kpiStats,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapPriorityFromDb(p: string | null): "high" | "medium" | "low" {
  if (p === "urgent") return "high";
  if (p === "normal") return "medium";
  return "low";
}

function mapTrendFromDb(t: string | null): "rising" | "falling" | "steady" {
  if (t === "up" || t === "new") return "rising";
  if (t === "down") return "falling";
  return "steady";
}
