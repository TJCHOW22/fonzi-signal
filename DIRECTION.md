# fonzi-signal — product direction

status: PROPOSED 2026-08-17, awaiting TJ approval. nothing below this line is built until he signs off.
what exists today is audited in §1 and keeps running as-is either way.

the thesis: fonzi-signal grows from an X analytics dashboard into the local-first foundation of
fonzi's internal content operating system, modeled on the sarah chieng / cova workflow
(ideate → script → record → edit → repurpose → publish → learn). humans keep creativity and
taste; the system does research, organization, evaluation, and repetitive production work.
AI never invents our taste or our opinions.

---

## 1. audit — what the build actually is (verified 2026-08-17)

| piece | state | evidence |
|---|---|---|
| next.js app (feed / roster / label / briefs) | working | booted on :3211, all pages 200, row actions + add-source form render, dark UI |
| schema.sql (sources, baselines, posts, labels, briefs) | working | single source of truth, applied idempotently by app + python; portable SQL for the postgres swap |
| scripts migration (x_scrape / x_score / eval_harness → sqlite) | working | fixture rerun: 9 scored, guards fired (1 deferred, 1 discarded), 5 survivors → db; eval recall 3/3 PASS |
| /api/health + /api/ingest | working | health returns live counts; ingest is the future dev-facing write path |
| seed labels | working | seb's 168/477/$203k positive imported |
| launch config | working | "fonzi-signal" on :3211, remotion entry untouched |
| bug found + fixed in audit | fixed | status-chip href didn't reset the param (couldn't click back to "new"); one-line fix in app/page.tsx qs(), verified |
| /story-brief skill | updated, unrun | reads sqlite now, slack send gated on destination confirm (#tj-ai-notifications C0BFFP5RW2J) |
| notion X Signal DB | dead, NOT deleted | trash only on TJ's explicit approval |

verdict: everything is preservable. nothing gets restarted.

## 2. how today's build maps into the OS

what we shipped is the **learn + ideate slice**: sources/posts/baselines/labels = ideate,
briefs = the daily surface, labels + eval = the taste layer. the OS direction ADDS the spine
that connects an idea to everything downstream of it. no existing table changes meaning.

## 3. canonical content object (the spine)

one `items` table, everything else hangs off it. an item is one piece of content moving
through the pipeline; every stage transition is visible on one page.

```
items          id, title, stage, person (tj|brett|seb|fonzi), lane, framework, hook_shape,
               angle, status_notes, created_at, updated_at
               stage: inbox → idea → scripting → production → published → learned
item_sources   item_id → posts.id | reels ref | url        (source material, many per item)
item_takes     item_id → delphi take ref + quote            (founder grounding, never fabricated)
drafts         item_id, version, body, generator (skill+version), critique_json, rank, chosen
scripts        item_id, approved_draft_id, final_body, speakability_pass
shot_lists     item_id, shot rows (a-roll/b-roll/screen/graphic, script context)
assets         item_id, kind, path/url (drive, higgsfield, remotion renders)
variants       item_id, platform, caption, media ref, utm, status
publications   variant_id, platform, url, posted_at
metrics        publication_id, captured_at, impressions/likes/saves/comments/views
learnings      item_id | skill_version_id, note, evidence, written_by (retro)
feedback       draft_id | item_id, verdict, note, by, created_at
```

existing tables stay verbatim; `posts` rows get promoted into items via item_sources.

## 4. prompt/skill architecture — the 50-post method, versioned

**skill = brain (markdown in .claude/skills, unchanged mechanism). pattern layer = data (db, versioned).**

```
skill_versions  skill, version, pattern_md, evidence_refs, built_from (teardown id), created_at
teardowns       account/person, platform, post_count, findings_md, universal_vs_platform, created_at
```

the account-teardown pipeline (reused for every voice + platform skill):
1. pull the most recent ~50 relevant posts for the account (apify for X, vista for brand
   accounts, reels db for IG) — text AND media AND visible analytics, never captions alone.
   media pass: thumbnails/frames described via claude vision so format is studied visually.
2. score each vs the account's own baseline (the heat method we already built).
3. per post: hook, idea, tone/voice, pacing, structure, format, length, CTA, intended
   audience, platform-native conventions, why it over/underperformed.
4. split universal patterns from platform-specific ones.
5. write findings → `teardowns`, distill → `skill_versions.pattern_md` (new version, never overwrite).
6. the skill file references "latest pattern version for <skill>" at compose time.

**voice separation is structural:** four pattern lines that never blend — tj (/tweet + voice-profile),
brett (brett-captions), seb (new, from the @hiiinternet teardown), fonzi brand (fonzi-captions).
each skill pulls only its own line's pattern versions.

**pattern remix, not clone & restyle:** patterns are CONSTRAINTS learned from winners
(hook shapes, structures, pacing rules). never copy wording, never keep a source's
beat-by-beat structure. the fit gate already encodes this ("can we argue with it").

**multi-draft compose loop** (shared reference used by every writing skill):
generate 3-5 candidates internally → critique each on factual accuracy, voice fidelity,
idea strength/originality, clarity, attention/retention, platform fit, speakability (when
spoken) → rank → return the winner + 2-line why-it-won → store all candidates in `drafts`
with critique_json. human verdicts land in `feedback`; monthly retro reads feedback +
metrics and cuts the next skill_version. opinions ground in item_takes/delphis, cited, or
the draft says "no take on file" — never fabricated. AI-writing tells and generic hype are
kill-list items in the critique pass.

**versioned skills roster** (each = skill file + pattern line in db):
idea-research · interview/voice-dump extraction · short-form script · long-form script ·
x-posts · linkedin · instagram · tiktok · youtube · shot-list · repurposing · monthly-retro

### 4a. Fonzi positioning layer — what the system is allowed to say

The Google Doc **Fonzi brand doc → Fonzi Positioning** is a positioning input, not a prompt
or voice authority. At compose time the system resolves conflicts in this order:

1. verified current product/data and approved founder takes;
2. `Knowledge/Fonzi - Brand.md` (operative voice and brand law);
3. this positioning layer (message, audience, objections, proof bank);
4. source-post patterns (format constraints only; never permission to inherit a claim).

**Core category story:** Fonzi routes talent to the work where they can create the most value.
The product should feel like a persistent, extremely plugged-in talent agent: it understands the
candidate, knows the market, surfaces relevant opportunities and keeps helping between job searches.
Describe the mechanism as product-driven routing, career intelligence, market pricing and access.
Do not default to `marketplace`, generic recruiting-agency language, or a job-board frame.

**Audience routing is mandatory before generation:**

- **Talent:** get priced by the market discreetly, discover strong companies without repeatedly
  applying, and receive relevant interview requests with compensation context. Lead with career
  leverage, market intelligence, access and dignity—not “we help you find a job.”
- **Companies:** reach strong off-market talent they could not identify or activate through their
  normal LinkedIn/agency workflow. Lead with access, signal, candidate experience, speed and cost;
  never imply unlimited inventory or guaranteed hiring outcomes.

Every idea and draft stores one primary audience and one job-to-be-done. If it tries to sell both
audiences at once, the critique pass must flag it unless the format explicitly requires both sides.

**Approved content pillars:**

1. **Market pricing and proprietary bid data** — actual upfront salary-bid patterns, ranges and
   market movement. This is the highest-moat proof lane.
2. **Career intelligence** — who is hiring, growing, raising, paying, losing talent or creating
   unusually high-leverage engineering work.
3. **Routing and fit** — why skills-only matching, recruiter inventory and application volume miss
   the right person/right team/right problem combination.
4. **Access without applying** — discreet discovery, relevant introductions and salary context
   before wasting candidate or company time.
5. **IRL scene and social graph** — events, friendships, shared interests and community as real
   talent-capture and matching signals, not lifestyle filler.
6. **Outcomes and transformation** — placements, accepted interviews, compensation discovery and
   company wins told with attributable evidence and consent.

**Objection bank (a draft should name the objection it resolves):**

- “This is another job board full of open-to-work applicants.”
- “This is a recruiter spraying the same role or leftover candidate inventory.”
- “I will get spammed, exposed to my employer or pushed into irrelevant roles.”
- “A platform cannot understand fit or quality.”
- “Upfront salary bids are premature or uncomfortable.”
- “The candidate pool cannot be both selective and liquid.” This remains an open positioning
  tension; do not manufacture a resolution. Use fit/matching language and audience-specific proof.

**Proof-bank contract:** candidate numbers in the source document (including the $207K average bid,
$400K high, 30.6% of ex-leader bids at $250K+, the $150K–$325K offer spread, and company/customer
counts or names) are *candidate proof points*, not evergreen facts. Before a draft uses one, require
an approved source, as-of date, scope/denominator and publication permission. If any are missing,
the generator must replace the number with a request for evidence—not a softened or invented claim.

**Voice application:** preserve the operative “elegant researcher who’s based” law: truth first,
then voice, then platform. Specific numbers and calm verdicts beat adjectives. Lowercase, slang and
casual CTAs may appear only when the selected voice/platform pattern supports them; they are not
global defaults. Corporate announce-speak, recruiter spam, generic hype, manufactured FOMO and
combative industry takes fail the critique pass. Preferred CTA routes are low-friction and native
(text, one application, or a relevant introduction), but the exact number/link must come from current
approved campaign data.

**Idea record additions:** `primary_audience`, `audience_job`, `content_pillar`, `objection`,
`positioning_frame`, `proof_refs`, `proof_as_of`, `claim_risk`, and `cta_route`. These fields travel
with the item from discovery through published learning so performance can be analyzed by message,
not merely by hook or format.

## 5. UX — calm, notion-familiar, not notion

- persistent left sidebar: **Inbox · Ideas · Scripts · Production · Calendar · Library · Insights**
- views: table + board first; gallery + calendar later (progressive disclosure, no dashboard clutter)
- every item opens as a full page: source material, takes, drafts (with critique), script,
  shot list, assets, variants, publish status, performance — one scroll, inline editing
- contextual AI actions on the item page (compose drafts, critique, shot-list) run through
  claude cli — the app itself stays LLM-free until devs adopt it
- slash commands + keyboard-first come with the block editor decision (phase C, maybe never — see §8)
- restrained type, neutral palette, whitespace — the current UI is already this; keep it

page mapping: Inbox = gate survivors + fresh takes to triage (promote → idea / archive; today's
feed becomes this) · Ideas = items board by stage/person · Scripts = drafting + critique ·
Production = shot lists/assets, mirrors the notion production ladder · Calendar = variants +
publications by date (vista stays the actual scheduler) · Library = the swipefile: exemplars,
hook mechanisms, teardowns · Insights = baselines, yield, per-person/platform performance, retro output

## 6. phased plan

**phase A — this week (finish what's in flight + the spine)**
1. apify token → 5-post gate check → seb teardown = the FIRST 50-post teardown, produces
   seb pattern v1 + fills the label set with real posts
2. roster confirm → seed `sources` (sqlite now, not notion)
3. wire brief → slack #tj-ai-notifications; first real /story-brief run
4. add `items` + `item_sources` + `item_takes`; Inbox page (feed + promote-to-idea action);
   Ideas page (table + board)
5. item page v1: structured sections, inline edit (no block editor)

**phase B — week 2-3 (the compose loop)**
6. `drafts`/`feedback`/`skill_versions`/`teardowns` tables; critique loop on the item page via claude cli
7. platform teardowns: brand X/LI/IG (vista data) + tj (article engine corpus) → pattern v1
   per platform skill; existing skills (fonzi-captions, /tweet, brett-captions) start
   referencing pattern versions instead of frozen reference.md content
8. /content-retro v1: monthly, reads metrics + feedback → new skill_versions + roster yields

**phase C — only after daily use is proven**
9. Production/Calendar/Library/Insights pages; shot-list skill; repurposing skill;
   variants/publications/metrics tables fed by production-sync + vista
10. deploy to vercel with deployment protection; sqlite → postgres; scripts → /api/ingest

## 7. working now / modify / add later

- **working now, untouched:** scrape+score scripts, schema v1 tables, feed/roster/label/briefs,
  eval harness, data drops menu, landscape roster draft, /story-brief (pending first run)
- **modify:** feed becomes Inbox (adds promote action) · /story-brief writes `items` rows for
  promoted angles · skills gain the pattern-version lookup · seb teardown output lands in
  `teardowns` not a loose md
- **add later:** everything in phase B/C, in that order
- **keep in notion:** delphis take bank + reels/production DBs (the live n8n estate reads them);
  the tool references them, never migrates them in v1

## 8. do NOT build

- a full block editor (v1 inline editing is enough; revisit only if daily use demands it)
- scheduling/auto-posting inside the tool — vista is the publisher, the API quote-post ban
  makes auto-posting impossible on X anyway
- an LLM pipeline inside the app (claude cli is the brain until devs adopt)
- auth/multi-user before the vercel deploy
- gallery view, real-time streaming, push queues of any kind — the article engine's 27/0
  deadlock stands as the permanent warning: nothing in this system waits on a human to unblock
- clone & restyle — replaced by pattern remix everywhere

## 9. open approvals

1. this direction doc
2. trash the dead notion X Signal DB `8271b342-2b77-475d-9727-bb16f795dc26` (empty, superseded)
3. brett's comp-data publication rule (blocks data mines #2/#8 + dollar figures in the weekly digest)
