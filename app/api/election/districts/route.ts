import { NextRequest, NextResponse } from "next/server";
import { getDistrictsByProvinceCode } from "@/lib/election-queries";

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const provinceCode = searchParams.get("province");

  if (!provinceCode) {
    return NextResponse.json(
      { error: "Missing ?province= query parameter" },
      { status: 400 },
    );
  }

  try {
    const districts = await getDistrictsByProvinceCode(provinceCode);
    return NextResponse.json(districts);
  } catch (err) {
    console.error("[/api/election/districts] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch districts" },
      { status: 500 },
    );
  }
}
