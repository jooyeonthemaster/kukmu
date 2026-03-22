import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/hot-topics
 * Returns top 20 hot topics ordered by count DESC.
 */
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("hot_topics")
      .select("*")
      .order("count", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[/api/hot-topics] Supabase error:", error.message);
      return NextResponse.json(
        { error: "핫토픽 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/hot-topics] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
