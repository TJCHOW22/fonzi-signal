# fonzi-signal - product direction

Fonzi Signal is the local-first Media and Drafts workspace. The current UI
skeleton is intentionally narrow: preserve source material, create one linked
draft, show generation state globally, and give the human a clean review
workspace.

## Product rules

1. Media is immutable source material. Creating a draft hides the source from
   the active grid without deleting it.
2. One source and workflow map to one draft. Generation is isolated and never
   resumes a model thread.
3. The database owns visible content, run state, revisions, generation
   provenance, artifacts, and notifications.
4. Generation may advance after the human clicks Create. It never opens a
   finished draft or publishes anything automatically.
5. Source adaptation preserves the thesis, mechanism, causal chain, and viewer
   payoff. Unsupported claims are removed, not replaced with invented facts.
6. The review surface keeps the source beside the editable draft and preserves
   revision history.

## Build next

Improve the Media and Drafts skeleton through real use: ingestion quality,
generation reliability, draft editing, revision visibility, and production
handoff. Do not restore the retired feed, ideas, briefs, roster, label, radar,
memory, scripts, or canvas-shell interfaces.
