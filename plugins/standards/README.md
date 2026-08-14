# standards

Knowtis engineering standards as model-invoked skills.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `reviewing-code-standards` | Skill | TypeScript, testing, and minimal-comments conventions for writing/reviewing code. |
| `writing-conventional-commits` | Skill | Single-line Conventional Commits + branch naming. |

The minimal-comments **enforcement** is not shipped here, so it can't double-fire when this plugin is installed globally. It lives in the user-level Claude config as a PreToolUse hook (`~/.claude/hooks/comment-policy.cjs`) that blocks the write in every repo and inside every subagent; knowtis additionally runs the same checks as the `knowtis/minimal-comments` ESLint rule so they reach CI and non-agent edits. This plugin carries the conventions as skills that any repo/agent can use.
