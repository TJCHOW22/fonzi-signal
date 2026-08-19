import assert from "node:assert/strict";
import test from "node:test";

import { avatarUrlFor } from "../../components/feed/avatar.ts";

test("builds X and Instagram creator avatar URLs", () => {
  assert.equal(avatarUrlFor("x", "@brettlucasmartin"), "https://unavatar.io/x/brettlucasmartin");
  assert.equal(avatarUrlFor("twitter.com", "Thomas Chow"), "https://unavatar.io/x/Thomas%20Chow");
  assert.equal(avatarUrlFor("instagram", "stephthefounder"), "https://unavatar.io/instagram/stephthefounder");
  assert.equal(avatarUrlFor("instagram.com", "@zauey.talks"), "https://unavatar.io/instagram/zauey.talks");
});

test("does not invent an avatar for unsupported or missing identities", () => {
  assert.equal(avatarUrlFor("youtube", "creator"), null);
  assert.equal(avatarUrlFor("x", ""), null);
  assert.equal(avatarUrlFor(null, "creator"), null);
});
