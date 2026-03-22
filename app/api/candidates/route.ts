import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/candidates
 * Query params:
 *   - province (string, optional)
 *
 * Joins candidates -> provinces for enriched data.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const province = searchParams.get("province");

    const supabase = createServerClient();

    let query = supabase
      .from("candidates")
      .select("*, provinces(name, code, population, voter_count)")
      .order("party", { ascending: true });

    if (province) {
      query = query.eq("province_code", province);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/candidates] Supabase error:", error.message);
      return NextResponse.json(
        { error: "후보자 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/candidates] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
