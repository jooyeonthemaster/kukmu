import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/polls
 * Query params:
 *   - province (string, optional)
 *   - limit    (number, default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") ?? 10), 100);
    const province = searchParams.get("province");

    const supabase = createServerClient();

    let query = supabase
      .from("v_latest_polls")
      .select("*")
      .order("date", { ascending: false })
      .limit(limit);

    if (province) {
      query = query.eq("province", province);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/polls] Supabase error:", error.message);
      return NextResponse.json(
        { error: "여론조사 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/polls] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
