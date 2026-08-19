# fonzi-signal — system map

The content system as built, with the two human decisions made explicit.
Companion to `DIRECTION.md`. Last verified 2026-08-17.

The single idea this map encodes: **the agent earns the idea more context, the human gives it a point of view.** Nothing advances a stage on its own.

---

## 1. The whole system

Two feeds, two human gates, one learning loop.

```mermaid
flowchart TD
    A["Creative Feed<br/>ranks source creatives by real performance"] --> B["Inbox idea"]
    B --> C["Automatic scout<br/>lightweight enrichment only"]
    C --> D{"HUMAN GATE 1<br/>worth exploring?"}

    D -->|"no"| X["Archive / stays in Inbox"]
    D -->|"yes"| E["Exploring"]

    E --> F["Deep agent research"]
    F --> G["Research ready<br/>decision dossier attached"]
    G --> H["Angle Feed<br/>one researched idea resurfaces daily"]
    H --> I["Human input<br/>agree, challenge, interview yourself, add lived proof"]

    I --> J{"HUMAN GATE 2<br/>is there a strong angle?"}
    J -->|"research more"| F
    J -->|"not compelling"| X
    J -->|"approve production"| K["Drafting"]

    K --> L{"Format"}
    L -->|"video"| M["Script + A-roll / B-roll"]
    L -->|"written"| N["Platform-native draft"]
    L -->|"visual"| O["Copy + asset plan"]

    M --> P["Editing"]
    P --> Q["Ready to publish"]
    N --> Q
    O --> Q

    Q --> R["Published"]
    R --> S["Performance and lessons"]
    S --> A
    S --> T["Memory<br/>what performed sharpens the next pick"]
    T --> F
```

**Why two gates and not one.** The original model had a single "worth investing in?" node doing two jobs at once: authorizing research and authorizing production. Those are different decisions with different costs. Gate 1 spends agent time. Gate 2 spends yours.

---

## 2. Inside the Angle Feed loop

The Creative Feed optimizes for *what deserves attention*. The Angle Feed optimizes for *what deserves an opinion*.

```mermaid
flowchart TD
    A["HUMAN GATE 1<br/>explore this"] --> B["Deep agent research"]

    B --> B1["Performance and source analysis"]
    B --> B2["Community questions and skeptical views"]
    B --> B3["Contrary evidence and facts"]
    B --> B4["Founder-memory matches"]
    B --> B5["3 grounded Fonzi angles + format recommendation"]

    B1 --> C["Decision dossier"]
    B2 --> C
    B3 --> C
    B4 --> C
    B5 --> C

    C --> D["Angle Feed<br/>resurfaces daily, one idea at a time"]
    D --> E["Human input<br/>react, disagree, tell a story, add lived proof"]

    E --> F{"HUMAN GATE 2<br/>strong angle?"}
    F -->|"not yet · research deeper"| B
    F -->|"approved"| G["Drafting"]
```

**Hard rule on the research step:** the agent never invents an opinion, a number, or a quote. Missing evidence gets reported as missing.

---

## 3. What each stage is allowed to do

| Stage | Actor | Advances on its own | Notes |
|---|---|---|---|
| Creative Feed | agent | yes | ranking only, never promotes an idea |
| Inbox | — | no | uncommitted signals |
| Automatic scout | agent | yes | lightweight enrichment, not deep research |
| Gate 1 | human | — | authorizes agent time |
| Deep research | agent | yes | writes the dossier, nothing else |
| Angle Feed | agent | yes | surfaces, never approves |
| Human input | human | — | the irreplaceable part |
| Gate 2 | human | — | authorizes production |
| Drafting → Published | mixed | no | human approval at publish |
| Performance and lessons | agent | yes | feeds ranking and memory |
