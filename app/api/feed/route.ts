import { NextRequest, NextResponse } from "next/server";
import { getFeed } from "../../../lib/feed/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    return NextResponse.json(getFeed({ profile: q.get("profile") ?? "thomas", cursor: q.get("cursor"), limit: Number(q.get("limit") || 20) }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "feed failed" }, { status: 400 });
  }
}
