# standards

Knowtis engineering standards as model-invoked skills.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `reviewing-code-standards` | Skill | TypeScript, testing, and minimal-comments conventions for writing/reviewing code. |
| `writing-conventional-commits` | Skill | Single-line Conventional Commits + branch naming. |

The minimal-comments **enforcement** (a PostToolUse hook) is not shipped here — it stays repo-local in the knowtis repo (`.claude/hooks/check-comments.mjs`), so it doesn't double-fire when this plugin is installed globally. This plugin carries the conventions as skills that any repo/agent can use.
