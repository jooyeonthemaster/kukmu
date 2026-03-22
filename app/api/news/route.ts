import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/news
 * Query params:
 *   - limit    (number, default 20)
 *   - province (string, optional)
 *   - significant (boolean, optional -- when true, use v_recent_significant_news)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const province = searchParams.get("province");
    const significant = searchParams.get("significant") === "true";

    const supabase = createServerClient();

    const viewName = significant
      ? "v_recent_significant_news"
      : "news_articles";

    let query = supabase
      .from(viewName)
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (province) {
      query = query.eq("province", province);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/news] Supabase error:", error.message);
      return NextResponse.json(
        { error: "뉴스 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/news] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
