/**
 * 데이터 접근 레이어 (Data Access Layer)
 *
 * 현재: mock-data.ts에서 직접 반환
 * Supabase 연결 후: supabase 클라이언트로 교체
 *
 * 모든 페이지는 이 파일을 통해 데이터를 가져온다.
 * 데이터 소스 전환 시 이 파일만 수정하면 된다.
 */

import type { Minister, Agenda, StockImpact, Meeting, KPIStat, HotTopic } from "./types";

// ── 현재: Mock 데이터 소스 ──
import {
  ministers as mockMinisters,
  agendas as mockAgendas,
  stockImpacts as mockStockImpacts,
  meetings as mockMeetings,
  kpiStats as mockKpiStats,
  hotTopics as mockHotTopics,
} from "./mock-data";

const USE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL != null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ── Ministers ──

export async function getMinisters(): Promise<Minister[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("ministers")
      .select("*")
      .order("fulfillment_rate", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map(dbToMinister);
  }
  return mockMinisters;
}

export async function getMinisterById(id: string): Promise<Minister | null> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("ministers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return dbToMinister(data as Row);
  }
  return mockMinisters.find((m) => m.id === id) ?? null;
}

// ── Agendas ──

export async function getAgendas(): Promise<Agenda[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("agendas")
      .select("*")
      .order("date", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map(dbToAgenda);
  }
  return mockAgendas;
}

export async function getAgendasByMinister(ministerName: string): Promise<Agenda[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("agendas")
      .select("*")
      .eq("minister_name", ministerName)
      .order("date", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map(dbToAgenda);
  }
  return mockAgendas.filter((a) => a.ministerName === ministerName);
}

export async function getAgendasByStatus(
  status: Agenda["status"]
): Promise<Agenda[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("agendas")
      .select("*")
      .eq("status", status)
      .order("date", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map(dbToAgenda);
  }
  return mockAgendas.filter((a) => a.status === status);
}

// ── Stock Impacts ──

export async function getStockImpacts(): Promise<StockImpact[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("stock_impacts")
      .select("*")
      .order("impact_score", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map(dbToStockImpact);
  }
  return mockStockImpacts;
}

// ── Meetings ──

export async function getMeetings(): Promise<Meeting[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    // 회의 목록 가져오기
    const { data: meetingsData, error: mErr } = await supabase
      .from("meetings")
      .select("*")
      .order("date", { ascending: false });
    if (mErr) throw mErr;

    // 회의-안건 연결 가져오기
    const { data: junctions, error: jErr } = await supabase
      .from("meeting_agendas")
      .select("meeting_id, agenda_id");
    if (jErr) throw jErr;

    // 안건 전체 가져오기
    const { data: agendasData } = await supabase.from("agendas").select("*");
    const agendaMap = new Map(
      ((agendasData as Row[]) ?? []).map((a) => [a.id as string, dbToAgenda(a)])
    );

    return ((meetingsData as Row[]) ?? []).map((m) => {
      const agendaIds = ((junctions as Row[]) ?? [])
        .filter((j) => j.meeting_id === m.id)
        .map((j) => j.agenda_id as string);
      return {
        id: m.id as string,
        meetingNumber: m.meeting_number as number,
        date: m.date as string,
        totalAgendas: (m.total_agendas as number) ?? 0,
        keyHighlights: (m.key_highlights as string[]) ?? [],
        attendees: (m.attendees as string[]) ?? [],
        agendas: agendaIds
          .map((aid) => agendaMap.get(aid))
          .filter(Boolean) as Agenda[],
      };
    });
  }
  return mockMeetings;
}

// ── KPI & Hot Topics ──

export async function getKpiStats(): Promise<KPIStat[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("kpi_snapshots")
      .select("*")
      .order("id", { ascending: true })
      .limit(4);
    if (error) throw error;
    return ((data as Row[]) ?? []).map((d) => ({
      label: d.label as string,
      value: d.value as string,
      change: Number(d.change),
      changeLabel: (d.change_label as string) ?? "",
      icon: (d.icon as string) ?? "",
    }));
  }
  return mockKpiStats;
}

export async function getHotTopics(): Promise<HotTopic[]> {
  if (USE_SUPABASE) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("hot_topics")
      .select("*")
      .order("count", { ascending: false });
    if (error) throw error;
    return ((data as Row[]) ?? []).map((d) => ({
      id: d.id as string,
      keyword: d.keyword as string,
      count: (d.count as number) ?? 0,
      trend: ((d.trend as string) ?? "steady") as HotTopic["trend"],
      relatedMinistry: (d.related_ministry as string) ?? "",
      category: (d.category as string) ?? "",
    }));
  }
  return mockHotTopics;
}

// ── News Articles (Supabase only) ──

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  relevanceScore: number;
}

export async function getRecentNews(limit = 20): Promise<NewsArticle[]> {
  if (!USE_SUPABASE) return [];
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("news_articles")
    .select("id, title, url, source, published_at, summary, sentiment, relevance_score")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as Row[]) ?? []).map((d) => ({
    id: d.id as string,
    title: d.title as string,
    url: d.url as string,
    source: d.source as string,
    publishedAt: d.published_at as string | null,
    summary: d.summary as string | null,
    sentiment: d.sentiment as NewsArticle["sentiment"],
    relevanceScore: Number(d.relevance_score),
  }));
}

export async function getNewsByAgenda(agendaId: string): Promise<NewsArticle[]> {
  if (!USE_SUPABASE) return [];
  const { supabase } = await import("./supabase");
  const { data: junctions } = await supabase
    .from("news_agendas")
    .select("news_id")
    .eq("agenda_id", agendaId);
  const rows = (junctions as Row[]) ?? [];
  if (!rows.length) return [];
  const newsIds = rows.map((j) => j.news_id as string);
  const { data, error } = await supabase
    .from("news_articles")
    .select("id, title, url, source, published_at, summary, sentiment, relevance_score")
    .in("id", newsIds)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return ((data as Row[]) ?? []).map((d) => ({
    id: d.id as string,
    title: d.title as string,
    url: d.url as string,
    source: d.source as string,
    publishedAt: d.published_at as string | null,
    summary: d.summary as string | null,
    sentiment: d.sentiment as NewsArticle["sentiment"],
    relevanceScore: Number(d.relevance_score),
  }));
}

// ── DB → App 타입 변환 (snake_case → camelCase) ──

function dbToMinister(d: Row): Minister {
  return {
    id: d.id as string,
    name: d.name as string,
    ministry: d.ministry as string,
    position: d.position as string,
    imageUrl: d.image_url as string | undefined,
    totalStatements: (d.total_statements as number) ?? 0,
    fulfillmentRate: (d.fulfillment_rate as number) ?? 0,
    recentActivity: (d.recent_activity as string) ?? "",
    trend: (d.trend as Minister["trend"]) ?? "stable",
    trackedAgendas: (d.tracked_agendas as number) ?? 0,
  };
}

function dbToAgenda(d: Row): Agenda {
  return {
    id: d.id as string,
    title: d.title as string,
    ministry: d.ministry as string,
    ministerName: d.minister_name as string,
    status: d.status as Agenda["status"],
    date: d.date as string,
    category: d.category as string,
    priority: (d.priority as Agenda["priority"]) ?? "medium",
    description: (d.description as string) ?? "",
  };
}

function dbToStockImpact(d: Row): StockImpact {
  return {
    stockCode: d.stock_code as string,
    stockName: d.stock_name as string,
    impactScore: d.impact_score as number,
    direction: d.direction as StockImpact["direction"],
    sector: d.sector as string,
    relatedPolicy: (d.related_policy as string) ?? "",
    priceChange: d.price_change as number | undefined,
    volume: d.volume as number | undefined,
  };
}
