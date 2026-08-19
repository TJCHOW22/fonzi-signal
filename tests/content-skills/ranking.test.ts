import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_SKILLS, DEFAULT_WEIGHTS, rankDrafts, scoreDraft, type DraftCandidate } from "../../lib/content-skills/index";

const candidate = (id: string, value: number): DraftCandidate => ({
  id,
  text: id,
  scores: { accuracy: value, voice: value, originality: value, clarity: value, attention: value, platformFit: value, speakability: value },
});

test("registry contains every required versioned skill and shared research method", () => {
  assert.deepEqual(CONTENT_SKILLS.map(({ id }) => id), ["idea-evaluation", "interview", "short-form-script", "x-post", "linkedin-post", "shot-list", "repurposing", "ai-writing-detection"]);
  for (const skill of CONTENT_SKILLS) {
    assert.match(skill.version, /^\d+\.\d+\.\d+$/);
    assert.equal(skill.research.sampleSize, 50);
    assert.deepEqual(skill.research.inspect, ["copy", "media", "context", "performance"]);
    assert.equal(skill.research.separateUniversalAndPlatformPatterns, true);
  }
});

test("scoreDraft normalizes weights", () => assert.equal(scoreDraft(candidate("a", 7), DEFAULT_WEIGHTS), 7));

test("rankDrafts ranks descending and breaks ties by id", () => {
  assert.deepEqual(rankDrafts([candidate("z", 5), candidate("a", 5), candidate("best", 9)]).map(({ id, rank }) => [id, rank]), [["best", 1], ["a", 2], ["z", 3]]);
});

test("invalid scores and duplicate ids fail loudly", () => {
  assert.throws(() => scoreDraft(candidate("bad", 11)), /between 0 and 10/);
  assert.throws(() => rankDrafts([candidate("same", 1), candidate("same", 2)]), /unique/);
});
