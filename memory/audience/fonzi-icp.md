---
name: fonzi-icp
description: The operational audience brief for Fonzi content. Select one ICP and one job before writing.
type: context
use_when: Choosing an audience, pain, job-to-be-done, message, offer, or CTA.
owns: Audience selection and audience-specific messaging.
sources:
  - Knowledge/Fonzi - Product.md
  - Knowledge/Fonzi - Brand.md
related:
  - ../identity/fonzi-positioning.md
  - ../proof/fonzi-proof-rules.md
  - ../voice/fonzi-voice-system.md
---

# Fonzi ICP

## Instructions to the system

Load this file before generating any content. Select exactly one primary ICP and one current job-to-be-done.

Return these five fields before drafting:

1. Primary ICP
2. Current situation
3. Single problem
4. Desired change
5. Relevant Fonzi value

If the audience is unclear, stop and ask. Do not average multiple audiences into a generic “tech” reader.

## Purpose

Use this context to choose the single person a piece is for, the problem it addresses, and the change it should create.

Fonzi serves two sides of the market. Every piece of content must choose one primary audience.

Do not write to “engineers and companies.” Pick a specific person, a specific pain, and a specific desired change.

## The simple version

| Audience | Who they are | What they want | What Fonzi gives them |
|---|---|---|---|
| Talent | Senior AI and software engineers who are good at their work but lack visibility into the market | Better work, stronger teams, accurate compensation context, and access without repeatedly applying | One profile that reaches relevant companies, salary bids up front, market intelligence, and discreet introductions |
| Companies | Technical founders and hiring leaders building important AI products | Strong engineers their normal recruiting workflow does not find or activate | Product-driven matching, access to off-market talent, and high-signal candidate recommendations |

## Primary talent ICP: The Restless Builder

### Who

- Senior, staff, principal, founding, or product-minded engineer
- Usually 5 to 15 years of experience
- Often at Big Tech or a startup that became slower and more political
- Still employed and not publicly “open to work”
- Wants ownership, speed, technical depth, and a small strong team

### Their situation

They are paid well but no longer feel like a builder. They spend more time navigating process than shipping. They suspect better opportunities exist, but they do not know which companies are genuinely strong, what those companies pay, or which role is worth taking.

### Their core job

> Show me the highest-leverage work I could be doing next, without making me become a full-time job seeker.

### Pains to write about

- “I cannot tell which AI companies are real.”
- “I would move for the right team, but not for another random startup.”
- “I do not know what the market would pay me.”
- “I miss shipping meaningful work.”
- “I do not want recruiter spam or another application process.”
- “I do not want my employer to know I am exploring.”

### Desired outcomes

- Discover high-quality companies before they become obvious
- Understand the team, problem, trajectory, and compensation before investing time
- Receive relevant interview requests instead of searching job boards
- Compare opportunities without repeating the same story to many recruiters
- Move into work with more ownership, learning, and upside

### Messages that land

- The market already knows what you are worth. You should too.
- One profile can put the right companies in front of you.
- Better career decisions start with better market information.
- The right role is a team, a problem, and a trajectory, not a keyword match.
- You should not need to become a job seeker to learn what is possible.

### Avoid

- “We help engineers find jobs.”
- “Apply now.”
- Generic job-board language
- Open-to-work assumptions
- Hype about “dream jobs”
- Claims that every engineer or every company is available

## Secondary talent ICP: The Invisible Expert

### Who

- Staff, principal, architect, or deep specialist
- Often 10 or more years of experience
- Strong in a narrow technical domain
- Has created major value without a famous title, public profile, or brand-name employer
- Is overlooked by recruiters who scan logos and keywords

### Their core job

> Find the company where my specific expertise is unusually valuable.

### Pains to write about

- Their real impact is invisible on a resume
- Generalist recruiters cannot evaluate their specialty
- Their title understates their value
- They are tired of irrelevant outreach
- They want to be recruited for the problem they can solve, not a keyword

### Messages that land

- Rare expertise is only valuable when it reaches the right problem.
- The best match may put a specialist in a different compensation bracket.
- A logo is not a measure of technical value.
- Matching should understand what you built and why it mattered.

## Company ICP

### Who

- Founder, technical founder, VP Engineering, Head of Talent, or hiring lead
- Building an AI-native or technically difficult product
- Hiring senior and specialized engineers
- Has important roles that LinkedIn, inbound applications, or agencies are not filling well
- Values signal and fit over applicant volume

### Their situation

They have access to many profiles but not enough high-confidence candidates. The engineers they most want are often employed, discreet, and not applying. Traditional sourcing creates activity but weak signal.

### Their core job

> Bring me strong engineers I could not identify or activate through my normal hiring workflow.

### Pains to write about

- High application volume with low relevance
- The best candidates are not applying
- Agencies recycle the same inventory
- Logo filters miss deep specialists
- Hiring teams waste time before compensation and fit are clear
- Poor candidate experience damages close rates

### Desired outcomes

- Meet strong off-market engineers
- Understand why each candidate fits the actual problem
- See compensation alignment early
- Reduce sourcing noise and wasted interviews
- Create a better experience for scarce candidates

### Messages that land

- More profiles are not the answer. Better signal is.
- The right specialist may be invisible to a logo-first search.
- Strong candidates should understand the role and compensation before the first call.
- Product-driven matching can find fit that recruiter inventory misses.

### Avoid

- Guaranteed hires
- Unlimited candidate supply
- “Replace your recruiting team”
- High-volume marketplace language
- Claims about speed, cost, or candidate quality without current evidence

## Audience routing prompt

Use this before creating an idea, brief, script, caption, or visual.

> Choose exactly one primary audience:
>
> 1. Restless Builder
> 2. Invisible Expert
> 3. Company hiring leader
>
> Then state:
>
> - Who is this for?
> - What is happening in their life or work right now?
> - What single problem does this piece address?
> - What do they believe before seeing it?
> - What should they understand, feel, or do after seeing it?
> - What proof supports the message?
> - Which Fonzi value is relevant?
>
> If the piece targets more than one audience, rewrite it around one. If the proof is missing, ask for it. Do not invent it.

## Content generation prompt

> Create content for **[ICP]**.
>
> Their current situation is **[situation]**.
>
> The single problem is **[problem]**.
>
> The useful truth or insight is **[insight]**.
>
> Support it with **[approved proof]**.
>
> The desired outcome is **[what changes for them]**.
>
> Use the Fonzi voice: calm, specific, direct, and evidence-led. Write one idea. Do not use recruiter spam, corporate announce language, generic hype, or invented urgency. Do not mix the talent and company value propositions.

## Quality check

Before approving the work, answer yes to all seven:

- Is one ICP named?
- Is one real problem named?
- Does the opening make sense to that person immediately?
- Is the value specific to Fonzi?
- Is every factual claim supported?
- Does the piece avoid job-board and recruiter language?
- Is the next step appropriate for this audience?

## Known uncertainties

- Restless Builder is the strongest evidenced candidate segment.
- Invisible Expert is supported by qualitative and channel evidence but is less directly measured.
- Company-side firmographic boundaries still need founder validation.
- Quiet Quitter and Solo Founder are tertiary hypotheses, not default content audiences.

When uncertainty matters, label it. Do not turn a working hypothesis into a confident claim.

## Retrieval and conflict rules

- This file owns audience routing.
- For full segment evidence, funnel numbers, and channel history, open Knowledge/Fonzi - Product.md.
- For what Fonzi is allowed to claim about itself, open ../identity/fonzi-positioning.md.
- For quantitative claims, open ../proof/fonzi-proof-rules.md.
- For speaker and wording decisions, open ../voice/fonzi-voice-system.md.
- Current verified product data outranks this summary.
- Approved founder decisions outrank working hypotheses.
- Never infer demographics, motivation, or pain beyond what the evidence supports.
