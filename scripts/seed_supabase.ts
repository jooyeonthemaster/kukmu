/**
 * Supabase 시드 스크립트
 * mock-data.ts → Supabase DB 삽입
 *
 * 실행: npx tsx scripts/seed_supabase.ts
 * 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수
 */

import { createClient } from "@supabase/supabase-js";
import {
  ministers,
  agendas,
  stockImpacts,
  meetings,
  kpiStats,
  hotTopics,
} from "../lib/mock-data";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seed() {
  console.log("=== 국무노션 Supabase Seeding ===\n");

  // 1. Ministers
  console.log(`[1/6] 장관 ${ministers.length}명 삽입...`);
  const { error: mErr } = await supabase.from("ministers").upsert(
    ministers.map((m) => ({
      id: m.id,
      name: m.name,
      ministry: m.ministry,
      position: m.position,
      image_url: m.imageUrl ?? null,
      total_statements: m.totalStatements,
      fulfillment_rate: m.fulfillmentRate,
      recent_activity: m.recentActivity,
      trend: m.trend,
      tracked_agendas: m.trackedAgendas,
    })),
    { onConflict: "id" }
  );
  if (mErr) console.error("  Error:", mErr.message);
  else console.log("  OK");

  // 2. Agendas
  console.log(`[2/6] 안건 ${agendas.length}건 삽입...`);
  const { error: aErr } = await supabase.from("agendas").upsert(
    agendas.map((a) => ({
      id: a.id,
      title: a.title,
      ministry: a.ministry,
      minister_name: a.ministerName,
      status: a.status,
      date: a.date,
      category: a.category,
      priority: a.priority,
      description: a.description,
    })),
    { onConflict: "id" }
  );
  if (aErr) console.error("  Error:", aErr.message);
  else console.log("  OK");

  // 3. Stock Impacts
  console.log(`[3/6] 종목 영향도 ${stockImpacts.length}건 삽입...`);
  const { error: sErr } = await supabase.from("stock_impacts").upsert(
    stockImpacts.map((s) => ({
      stock_code: s.stockCode,
      stock_name: s.stockName,
      impact_score: s.impactScore,
      direction: s.direction,
      sector: s.sector,
      related_policy: s.relatedPolicy,
      price_change: s.priceChange ?? null,
      volume: s.volume ?? null,
    })),
    { onConflict: "stock_code" }
  );
  if (sErr) console.error("  Error:", sErr.message);
  else console.log("  OK");

  // 4. Meetings
  console.log(`[4/6] 회의 ${meetings.length}건 삽입...`);
  const { error: mtErr } = await supabase.from("meetings").upsert(
    meetings.map((m) => ({
      id: m.id,
      meeting_number: m.meetingNumber,
      date: m.date,
      total_agendas: m.totalAgendas,
      key_highlights: m.keyHighlights,
      attendees: m.attendees,
    })),
    { onConflict: "id" }
  );
  if (mtErr) console.error("  Error:", mtErr.message);
  else console.log("  OK");

  // 5. Meeting-Agenda junctions
  const junctions: { meeting_id: string; agenda_id: string }[] = [];
  for (const m of meetings) {
    for (const a of m.agendas) {
      junctions.push({ meeting_id: m.id, agenda_id: a.id });
    }
  }
  console.log(`[5/6] 회의-안건 연결 ${junctions.length}건 삽입...`);
  if (junctions.length > 0) {
    // Delete existing and re-insert (junction tables don't upsert well)
    await supabase.from("meeting_agendas").delete().neq("meeting_id", "");
    const { error: jErr } = await supabase
      .from("meeting_agendas")
      .insert(junctions);
    if (jErr) console.error("  Error:", jErr.message);
    else console.log("  OK");
  }

  // 6. Hot Topics
  console.log(`[6/6] 핫 키워드 ${hotTopics.length}건 삽입...`);
  const { error: htErr } = await supabase.from("hot_topics").upsert(
    hotTopics.map((h) => ({
      id: h.id,
      keyword: h.keyword,
      count: h.count,
      trend: h.trend,
      related_ministry: h.relatedMinistry,
      category: h.category,
    })),
    { onConflict: "id" }
  );
  if (htErr) console.error("  Error:", htErr.message);
  else console.log("  OK");

  console.log("\n=== Seeding complete ===");
}

seed().catch(console.error);
