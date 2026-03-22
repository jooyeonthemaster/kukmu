import { NextRequest, NextResponse } from "next/server";
import { getDistrictDetail } from "@/lib/election-queries";

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const districtCode = searchParams.get("district_code");

  if (!districtCode) {
    return NextResponse.json(
      { error: "Missing ?district_code= query parameter" },
      { status: 400 },
    );
  }

  try {
    const detail = await getDistrictDetail(districtCode);
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[/api/election/district-detail] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch district detail" },
      { status: 500 },
    );
  }
}
