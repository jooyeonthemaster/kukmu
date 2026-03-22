import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

/**
 * GET /api/agendas
 * Query params:
 *   - status   (string, optional -- e.g. "implementing")
 *   - ministry (string, optional -- e.g. "기획재정부")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const ministry = searchParams.get("ministry");

    const supabase = createServerClient();

    let query = supabase
      .from("agendas")
      .select("*")
      .order("date", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (ministry) {
      query = query.eq("ministry", ministry);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/agendas] Supabase error:", error.message);
      return NextResponse.json(
        { error: "안건 데이터를 불러오는 데 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[/api/agendas] Unexpected error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
