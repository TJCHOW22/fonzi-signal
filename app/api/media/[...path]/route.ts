import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { mediaDir } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Read-only file server for data/media/ (gather + x thumbs). Paths are
// resolved and prefix-checked so ../ traversal can never escape the dir.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const root = path.resolve(mediaDir());
  const target = path.resolve(root, ...(parts ?? []));
  if (target !== root && !target.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = fs.readFileSync(target);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
