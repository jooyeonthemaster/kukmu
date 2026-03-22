import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/briefing
 * Query params:
 *   - date (string, optional -- ISO date like "2026-03-16")
 *
 * If no date is provided, returns the latest briefing.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date");

    const supabase = createServerClient();

    let query = supabase
      .from("daily_briefings")
      .select("*")
      .order("date", { ascending: false })
      .limit(1);

    if (date) {
      query = supabase
        .from("daily_briefings")
        .select("*")
        .eq("date", date)
        .limit(1);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/briefing] Supabase error:", error.message);
      return NextResponse.json(
        { error: "브리핑 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "해당 날짜의 브리핑이 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json(data[0]);
  } catch (err) {
    console.error("[/api/briefing] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
