import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConceptsPrompt,
  buildInterviewPrompt,
  buildResearchPrompt,
  buildShortFormScriptPrompt,
  contentIdentity,
  extractWinningScript,
} from "../lib/ai/item-prompts.ts";

const brett = {
  title: "The weird wedge behind a company",
  person: "Brett",
  angle: "The unglamorous distribution trick was the real product",
  notes: "Do not overstate the origin story.",
  sourceMaterial: "The supplied post says the founders began with a manual concierge service.",
  sections: {
    interview: "### Q: What surprised you?\nA: The manual work was the wedge, not a temporary hack.",
    research_dossier: "The founding date is UNVERIFIED.",
    concepts: "### WINNER: The service hiding inside the software",
  },
  takes: "- (Brett, company strategy) Distribution advantages often look operational at first.",
  persona: "Brett covers company strategy and founder-level market reads.",
  scriptCanon: "Open with the strongest accurate tension. Keep spoken sentences clean.",
};

test("normalizes supported content identities", () => {
  assert.equal(contentIdentity("TJ").key, "thomas");
  assert.equal(contentIdentity("Brett Martin").key, "brett");
  assert.equal(contentIdentity("Fonzi").key, "fonzi");
});

test("Brett interview, concepts, and research prompts stay person-aware", () => {
  const prompts = [
    buildInterviewPrompt(brett),
    buildConceptsPrompt(brett),
    buildResearchPrompt(brett),
  ];
  for (const prompt of prompts) {
    assert.match(prompt, /Brett Martin|Brett's|for Brett/);
    assert.doesNotMatch(prompt, /interviewing TJ|pull TJ|Three grounded Fonzi angles|directions for Fonzi/i);
    assert.match(prompt, /cannot browse|UNVERIFIED|exact follow-up queries/i);
  }
  assert.match(prompts[2], /Founder tension, weird wedge, or near-death moment/);
});

test("short-form prompt uses the protocol and guards Brett attribution", () => {
  const prompt = buildShortFormScriptPrompt(brett);
  assert.match(prompt, /CONTENT SKILL PROTOCOL/);
  assert.match(prompt, /Generate at least three candidates/);
  assert.match(prompt, /must not become Thomas narration or generic Fonzi brand copy/);
  assert.match(prompt, /Never put a first-person experience in Brett's mouth/);
  assert.match(prompt, /## Winning script/);
  assert.match(prompt, /## Source map/);
  assert.match(prompt, /REMOVE UNTIL VERIFIED/);
});

test("extracts only the record-ready winner for final_script", () => {
  const output = "## Winning script\nThis is the spoken copy.\n\n## Alternate hooks\nA hook\n\n## Source map\n- claim: source";
  assert.equal(extractWinningScript(output), "This is the spoken copy.");
  assert.equal(extractWinningScript("plain fallback"), "plain fallback");
});

test("Thomas and Fonzi remain explicitly routed", () => {
  assert.match(buildInterviewPrompt({ ...brett, person: "TJ" }), /Thomas Chow/);
  assert.match(buildConceptsPrompt({ ...brett, person: "Fonzi" }), /Fonzi brand/);
});
