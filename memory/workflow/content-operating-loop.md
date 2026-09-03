---
name: content-operating-loop
description: Minimal stage contract for Media to Drafts.
type: context
use_when: Moving content between workflow stages.
owns: Stage definitions and completion rules.
sources:
  - This app-local v1 workflow authority
related:
  - ../proof/fonzi-proof-rules.md
  - ../creative/creative-principles.md
  - ../voice/fonzi-voice-system.md
---

# Content operating loop

## Instructions to the system

Advance a draft only when the current stage has produced a usable artifact.

## Purpose

Keep Media generation resumable, visible, and auditable.

Media Create starts one resumable draft linked to its immutable source. The app returns to Media immediately. Generation advances through preparing source, writing, verifying facts, checking voice, and ready. Completion updates the draft and creates a notification. It never opens the draft automatically.

## Generation stages

1. Prepare source: map the thesis, mechanism, causal chain, payoff, and claims. Select only the beats needed for a clear short explanation.
2. Write: create three distinct explanation approaches and choose the clearest.
3. Verify facts: ground every retained factual claim and remove failures.
4. Check comprehension and voice: apply the one-listen test, revise failures, then recheck facts.
5. Ready: persist the winner, evidence, and immutable revisions.

The system owns retrieval, organization, versioning, and QA. Humans own taste, personal opinion, factual approval, final creative judgment, and publication.

A stage is complete only when its artifact can be used by the next stage. A filled field is not proof of completion.

## Quality check

Each stage has its artifact, the source stays immutable, and completion never redirects.

## Retrieval and conflict rules

This file owns stage progression. Creative, proof, and voice files own their respective review rules.
