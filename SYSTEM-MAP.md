# fonzi-signal - system map

The app has two visible surfaces, Media and Drafts. A human starts the flow;
the bounded generation stages can then advance without opening or publishing
the result.

```mermaid
flowchart LR
    A["Media<br/>immutable source"] --> B{"HUMAN<br/>Create?"}
    B -->|yes| C["One linked draft<br/>database source of truth"]
    C --> D["Isolated Responses API call<br/>skill + transcript only"]
    D --> E["Deterministic hook check"]
    E -->|pass| I["Ready notification"]
    E -->|copied hook| F["One isolated retry"]
    F -->|pass| I
    F -->|fail| G["Explicit failed state"]
    I --> J{"HUMAN<br/>open draft?"}
    J -->|click| K["Source vs draft workspace"]
```

Create returns to Media immediately. The converted source leaves the active
grid but stays in the database and on the draft page. Repeated Create requests
reuse the same draft. Global controls read persisted run state and notifications
from the draft APIs.

The local SQLite database owns media, draft content, generation runs, model and
prompt provenance, immutable revisions, production stage, and notification
history. Generation uses no Codex session, workspace context, MCP tools, or
stored model response.
