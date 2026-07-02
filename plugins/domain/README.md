# domain

Knowtis tribal knowledge, packaged: the facts every session otherwise re-derives from `docs/` and the codebase.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `orienting-in-knowtis` | Skill | Repo map, dual alias namespaces, Nx boundaries, the two AI modules, deploy/migration rules, known footguns. |
| `building-copilot-features` | Skill | Copilot/AI-gateway safety invariants (HITL, injection guard, fallback chain, BYOK, retrieval, memory) + the promptfoo eval workflow. |
| `wiring-realtime-collaboration` | Skill | Yjs/Hocuspocus invariants: handshake auth, server-enforced read-only, trivial-fragment guard, external-update broadcast. |
| `knowtis-architect` | Agent | Read-only domain expert (Read/Grep/Glob/Skill only) for design review against the invariants and deep architecture Q&A. |
