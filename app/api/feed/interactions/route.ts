import { NextRequest, NextResponse } from "next/server";
import { recordInteraction } from "../../../../lib/feed/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(recordInteraction({ profile: body.profile, postId: body.postId, action: body.action,
      sessionId: body.sessionId, comment: body.comment, metadata: body.metadata }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "interaction failed" }, { status: 400 });
  }
}
