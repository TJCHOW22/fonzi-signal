# Fonzi memory governance

## Principle

The memory graph is a decision system, not a document archive.

Add a memory only when it helps the system make a recurring decision more accurately. Source documents, project plans, meeting notes, drafts, and historical records stay outside the graph unless they are distilled into scoped context.

## Admission gate

A memory may enter the graph only when all are true:

1. It owns one clear decision.
2. The decision will recur.
3. Existing memory does not already own it.
4. The content is grounded in named sources.
5. Facts are separated from hypotheses.
6. Conflicts have an explicit precedence rule.
7. It tells the system when to load it.
8. It tells the system what to return.
9. It states what must not be inferred.
10. A human can identify who has authority to change it.

If any answer is no, keep the material as a source or working note.

## Required structure

Every active memory needs:

- frontmatter: name, description, type, use_when, owns, sources, related
- one H1 title
- Instructions to the system
- Purpose
- the actual context
- a task or evaluation prompt
- Quality check
- Retrieval and conflict rules

## Memory types

| Type | Meaning | Graph behavior |
|---|---|---|
| context | Stable information used to make decisions | May appear in the graph |
| procedure | Repeatable sequence with completion rules | May appear in Workflow |
| candidate | Proposed memory awaiting review | Must not be treated as authority |
| historical | Provenance only | Never loaded as current context |

## Update protocol

1. Retrieve the current memory and its named sources.
2. Identify the exact claim or instruction that changed.
3. Decide whether this is a correction, refinement, conflict, or new scope.
4. Update the smallest owning memory.
5. Preserve uncertainty and contrary evidence.
6. Run the memory audit.
7. Ask for human review when authority, positioning, voice, or publication safety changes.

Do not append meeting notes to a memory. Distill the decision.

## Deletion and merging

Merge memories when they own the same decision. Archive a memory when its decision no longer recurs. Never keep two active authorities for the same decision.

Deletion requires a replacement path or an explicit statement that the context is no longer needed.

## Recurring routines

### Weekly integrity audit

- run the structural validator
- inspect broken and orphaned references
- find duplicate ownership
- find proposal or historical leakage
- review files added during the week
- produce a review queue
- never rewrite memory automatically

### Monthly source refresh

- open every active memory
- recheck its named sources
- identify changed facts, superseded rules, and unresolved conflicts
- verify proof claims against current data
- propose minimal edits for human approval

### Quarterly architecture review

- test whether the domain structure still matches recurring decisions
- merge overlapping memories
- archive unused memories
- inspect retrieval failures from real content work
- revise the admission gate only with human approval

## Automation safety

Automations may read, validate, compare, and propose. They may not silently add, rewrite, promote, merge, or delete active memory.
