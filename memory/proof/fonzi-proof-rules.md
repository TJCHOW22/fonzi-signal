---
name: fonzi-proof-rules
description: Evidence and claim rules for Fonzi content.
type: context
use_when: Using numbers, outcomes, customer names, market claims, or product performance claims.
owns: Claim validation, evidence requirements, and publication safety.
sources:
  - Knowledge/Fonzi - Product.md
  - Approved product queries
  - Approved customer and candidate outcomes
related:
  - ../identity/fonzi-positioning.md
  - ../audience/fonzi-icp.md
  - ../workflow/content-operating-loop.md
---

# Fonzi proof rules

## Instructions to the system

Load this file before using any number, named company, outcome, comparison, or superlative.

For each claim, return:

1. Exact claim
2. Source
3. As-of date
4. Scope and denominator
5. Publication permission
6. Confidence
7. Decision: approved, needs verification, or reject

Do not draft around missing proof. Surface the gap.

## Purpose

Use this context whenever content makes a factual claim. Proof is part of the message, not decoration added after writing.

## Core rule

Never publish a number because it appears in an old document.

Every quantitative claim needs:

| Requirement | Question |
|---|---|
| Source | Where did this number come from? |
| As-of date | When was it true? |
| Scope | Which users, companies, bids, or time period does it cover? |
| Denominator | Out of how many? |
| Permission | Can this be published? |
| Owner | Who can confirm it? |

If any required field is missing, use a proof request instead of the claim.

## Strongest proof lanes

1. Real salary bids and market-pricing patterns
2. Offer ranges and compensation discovery
3. Relevant interview requests and accepted interviews
4. Placements and company outcomes
5. Hiring-market movement
6. Specific expert-to-problem matching stories

## Evidence hierarchy

Prefer evidence in this order:

1. Current product data with a defined query
2. Approved customer or candidate outcome
3. Approved founder observation grounded in direct experience
4. Current external primary source
5. Working hypothesis clearly labeled as a hypothesis

Do not turn a positioning sentence into evidence.

## Candidate proof points

Old brand and positioning documents contain numbers such as average bids, high bids, offer spreads, company counts, and investor names. Treat all of them as candidate proof points until reverified.

## Proof prompt

> Audit every factual statement in this draft. For each claim, return the source, as-of date, scope, denominator, publication permission, and confidence. Mark unsupported claims as NEEDS PROOF. Do not soften, estimate, or invent a replacement number.

## Writing rule

Use specifics over adjectives. A verified number and a calm interpretation are stronger than “massive,” “elite,” or “industry-leading.”

## Quality check

- Can a reader understand what the number measures?
- Is the comparison fair?
- Is the evidence current?
- Is the example attributable and approved?
- Does the conclusion stay within what the evidence proves?

## Source context

Detailed evidence lives in the Fonzi Product source and approved product queries. This file governs how proof is used.

## Retrieval and conflict rules

- This file owns whether a claim is usable, not whether it sounds good.
- Retrieve the original query or approved outcome before trusting a summary.
- If two sources conflict, prefer the newer source only when scope and method are comparable.
- If scope differs, report both and explain the difference.
- Positioning documents are not evidence.
- A historical number may guide research but may not appear in public copy without revalidation.
- After proof is approved, use ../voice/fonzi-voice-system.md to express it.
