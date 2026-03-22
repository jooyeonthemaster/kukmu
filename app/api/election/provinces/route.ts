import { NextResponse } from "next/server";
import { getProvinces } from "@/lib/election-queries";

export const revalidate = 60; // ISR: revalidate every 60 seconds

export async function GET() {
  try {
    const provinces = await getProvinces();
    return NextResponse.json(provinces);
  } catch (err) {
    console.error("[/api/election/provinces] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch provinces" },
      { status: 500 },
    );
  }
}
