type Cursor = { sessionId: string; offset: number };

export function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.sessionId !== "string" || !Number.isSafeInteger(parsed.offset) || parsed.offset! < 0) return null;
    return parsed as Cursor;
  } catch { return null; }
}
