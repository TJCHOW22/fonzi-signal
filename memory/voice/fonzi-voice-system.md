---
name: fonzi-voice-system
description: Voice context and speaker-routing rules for Fonzi content.
type: context
use_when: Writing, editing, or evaluating any public-facing Fonzi content.
owns: Speaker selection, verbal register, wording constraints, and voice QA.
sources:
  - Knowledge/Fonzi - Brand.md
  - Delphis/Fonzi.md
  - Approved founder take banks
related:
  - ../identity/fonzi-positioning.md
  - ../audience/fonzi-icp.md
  - ../proof/fonzi-proof-rules.md
---

# Fonzi voice system

## Instructions to the system

Load this file only after the audience, message, and facts are established.

Return:

1. Selected speaker
2. Approved take or “no take on file”
3. Required register
4. Words or patterns to avoid
5. Voice risks in the current draft

Voice may sharpen a true idea. It may not hide a weak idea or unsupported claim.

## Purpose

Use this context to choose the correct speaker and keep the brand calm, specific, useful, and credible.

## Voice law

Truth first. Then voice. Then platform.

Fonzi's register is the elegant researcher who is based:

- calm
- direct
- specific
- evidence-led
- internet aware
- confident without performing confidence
- useful before clever

## Fonzi says

- one clear idea
- plain opening sentences
- numbers with context
- calm interpretations
- specific companies, roles, dates, and mechanisms
- product-driven language
- short native CTAs when appropriate

## Fonzi never says

- corporate announcement language
- generic hype
- manufactured urgency
- recruiter spam
- empty industry commentary
- combative “war on recruiting” language
- invented taglines
- claims the evidence cannot support

## Speaker separation

Do not blend voices.

| Speaker | Primary territory | Default register |
|---|---|---|
| Fonzi | Market intelligence, product proof, community, outcomes | Calm researcher |
| Seb | Engineers, candidates, distribution, product mechanics | Direct peer, internet native |
| Brett | Companies, founders, venture, market structure | Operator and investor perspective |
| Thomas | Creative systems, AI media, production, design | Builder and creative technologist |

If the speaker is not named, write in the Fonzi brand voice.

Do not invent a founder take. Retrieve an approved take or state that no take is available.

## Voice prompt

> Write for [speaker] about [one idea] for [one ICP]. Use only approved facts and takes. Open plainly. Prefer specifics to adjectives. Keep the rhythm smooth and unhurried. Remove corporate language, recruiter language, generic hype, and any line that could belong to another AI company. If the selected speaker has no approved take, ask for one.

## Evaluation prompt

> Highlight every sentence that is vague, inflated, unsupported, off-speaker, or too generic. Explain the failure briefly, then rewrite it as a calm, specific sentence without adding new facts.

## Quality check

- Is the speaker unmistakable?
- Is the piece useful before it is clever?
- Does every strong claim have support?
- Could this line belong to any startup?
- Does the CTA feel native and low friction?

## Source context

The detailed voice canon lives in the Fonzi Brand source and approved speaker take banks. This file is the creation-time context.

## Retrieval and conflict rules

- This file owns expression, not positioning or evidence.
- Use ../identity/fonzi-positioning.md for the product story.
- Use ../audience/fonzi-icp.md for the reader and their problem.
- Use ../proof/fonzi-proof-rules.md for claims.
- Use Knowledge/Fonzi - Brand.md for the full brand law.
- Use Delphis/Fonzi.md for learned brand behavior and approved observations.
- Use the named founder's take bank for personal opinions.
- Never blend speakers to fill a missing take.
- Newer approved speaker feedback outranks old examples.
