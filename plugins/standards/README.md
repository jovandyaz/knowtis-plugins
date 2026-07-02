# standards

Knowtis engineering standards as an installable plugin.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `check-comments.mjs` | PostToolUse hook | Blocks objectively-bad comments (section dividers, task/PR refs, tombstones, date stamps, >3-line blocks) on TS/TSX/JS/JSX edits. Exits 2 with actionable stderr feedback. Self-filters by extension — safe to enable in any repo. |
| `reviewing-code-standards` | Skill | TypeScript, testing, and comments conventions for writing/reviewing code. |
| `writing-conventional-commits` | Skill | Single-line Conventional Commits + branch naming. |
