import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/polls/trends
 * Query params:
 *   - province (string, required)
 *   - days     (number, default 30)
 *
 * Returns time-series data suitable for Recharts line/area charts.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const province = searchParams.get("province");
    const days = Math.min(Number(searchParams.get("days") ?? 30), 365);

    if (!province) {
      return NextResponse.json(
        { error: "province 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const since = sinceDate.toISOString().slice(0, 10);

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("poll_trends")
      .select("*")
      .eq("province", province)
      .gte("date", since)
      .order("date", { ascending: true });

    if (error) {
      console.error("[/api/polls/trends] Supabase error:", error.message);
      return NextResponse.json(
        { error: "여론조사 추이 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/polls/trends] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
