import assert from "node:assert/strict";
import test from "node:test";
import { decodeCursor, encodeCursor } from "../../lib/feed/cursor.ts";

test("cursor round trips and rejects malformed input", () => {
  const cursor = encodeCursor({sessionId:"fixed-session",offset:40});
  assert.deepEqual(decodeCursor(cursor),{sessionId:"fixed-session",offset:40});
  assert.equal(decodeCursor("garbage"),null);
});
