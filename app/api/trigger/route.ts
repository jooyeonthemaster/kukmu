import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

/**
 * POST /api/trigger
 * Body: { pipeline: string }
 *
 * Manually triggers a Trigger.dev pipeline (admin use).
 * The `pipeline` value must match a registered task identifier.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body.pipeline !== "string" || !body.pipeline.trim()) {
      return NextResponse.json(
        { error: "pipeline 필드가 필요합니다. (예: 'crawl-news')" },
        { status: 400 },
      );
    }

    const pipeline = body.pipeline.trim();

    const handle = await tasks.trigger(pipeline, {});

    return NextResponse.json({ runId: handle.id });
  } catch (err) {
    console.error("[/api/trigger] Unexpected error:", err);

    const message =
      err instanceof Error ? err.message : "서버 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
