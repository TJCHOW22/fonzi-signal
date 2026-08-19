---
name: content-operating-loop
description: The operating loop that moves a Fonzi idea into published learning.
type: context
use_when: Planning, producing, repurposing, publishing, or reviewing content.
owns: Stage definitions, handoffs, required outputs, and completion rules.
sources:
  - DIRECTION.md
  - Knowledge/Fonzi - Pipeline.md
related:
  - ../audience/fonzi-icp.md
  - ../proof/fonzi-proof-rules.md
  - ../creative/creative-principles.md
  - ../voice/fonzi-voice-system.md
---

# Content operating loop

## Instructions to the system

Load this file whenever content work needs to move from one stage to another.

Return:

1. Current stage
2. Evidence that the current stage is complete
3. Missing context or approval
4. Next required output
5. Owner of the next decision

Never advance an item because it “looks done.” Advance it only when the next stage can use the output.

## Purpose

Use this context to move work forward without removing human judgment.

## The loop

Discover → Select → Ground → Create → Produce → Repurpose → Publish → Learn

## 1. Discover

Collect signals from product data, customers, founders, market events, strong source content, interviews, and performance.

Output: a source with provenance, not a draft.

## 2. Select

Choose one audience, one problem, one insight, one content pillar, and one desired outcome.

Output: a clear content idea.

## 3. Ground

Attach approved founder takes, product facts, proof, and the relevant memory modules.

Output: a brief with no invented opinion.

## 4. Create

Generate multiple approaches. Critique them for accuracy, idea strength, specificity, voice, originality, and platform fit. Select the strongest approach.

Output: a chosen draft and the reason it won.

## 5. Produce

Turn the draft into the required asset. Keep the format native to the platform and preserve human creative control.

Output: an approved master asset.

## 6. Repurpose

Translate the idea for another platform or format. Preserve the core truth, but rebuild the opening, structure, pacing, and CTA.

Output: native variants, not copied text.

## 7. Publish

Confirm approval, evidence, final copy, ownership, links, tracking, and timing.

Output: a live URL and publication record.

## 8. Learn

Compare the result with its goal and baseline. Record what worked, what failed, and which context or skill should change.

Output: a specific learning tied to evidence.

## Human responsibilities

Humans own:

- taste
- opinion
- personal stories
- factual approval
- final creative judgment
- publication approval

The system owns:

- retrieval
- organization
- repetitive transformations
- version tracking
- QA checks
- performance synthesis

## Operating prompt

> Identify the current stage of this content item. State what context is required, what is missing, the next concrete output, and who must approve it. Do not skip grounding or approval. Do not treat a source as a draft or a draft as approved content.

## Completion rule

No stage is complete because a field exists. It is complete when its required output is usable by the next stage.

## Quality check

- Is the current stage supported by an actual artifact?
- Are audience, facts, and approved takes attached before drafting?
- Is the next output concrete and owned?
- Has required human approval happened?
- Can the next stage use the output without reconstructing missing context?
- Will the published result feed a specific learning back into the system?

## Retrieval and conflict rules

- This file owns process, not message, facts, or voice.
- Use ../audience/fonzi-icp.md during Select.
- Use ../proof/fonzi-proof-rules.md during Ground and before Publish.
- Use ../creative/creative-principles.md during Create, Produce, and Repurpose.
- Use ../voice/fonzi-voice-system.md during Create and final QA.
- Use Knowledge/Fonzi - Pipeline.md for detailed production procedures.
- Use DIRECTION.md only for implementation history and system design. Never load its proposal status into content context.
- If the current stage is uncertain, infer it from completed artifacts and state the evidence.
