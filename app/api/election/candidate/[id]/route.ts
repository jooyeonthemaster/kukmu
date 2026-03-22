import { NextRequest, NextResponse } from "next/server";
import { getCandidateDetail } from "@/lib/election-queries";

export const revalidate = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing candidate id" },
      { status: 400 },
    );
  }

  try {
    const candidate = await getCandidateDetail(id);

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(candidate);
  } catch (err) {
    console.error("[/api/election/candidate] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch candidate" },
      { status: 500 },
    );
  }
}
