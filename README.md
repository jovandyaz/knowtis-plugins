# knowtis-plugins

[![validate](https://github.com/jovandyaz/knowtis-plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/jovandyaz/knowtis-plugins/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Claude Code plugin and Agent Skill distribution for the
[Knowtis](https://github.com/jovandyaz/knowtis-app) platform.

## Install

Knowtis skills are project-scoped. The Knowtis repository declares this marketplace and enables its Claude Code plugins in `.claude/settings.json`. Contributors install or update those project-scoped plugins with `pnpm setup:agents`; no user-global activation is required.

```json
{
  "extraKnownMarketplaces": {
    "knowtis-plugins": {
      "source": { "source": "github", "repo": "jovandyaz/knowtis-plugins" }
    }
  },
  "enabledPlugins": {
    "domain@knowtis-plugins": true,
    "db-ops@knowtis-plugins": true,
    "delivery@knowtis-plugins": true
  }
}
```

## Plugins

| Plugin | Category | What it provides |
| --- | --- | --- |
| [`db-ops`](plugins/db-ops/) | database | Drizzle migration discipline (`generate` → commit → `migrate`, never `push` on shared DBs) and a read-only Postgres investigation contract. |
| [`delivery`](plugins/delivery/) | deployment | CI readiness and Nx-affected diagnosis, GitHub-native stacked PRs, and CI-driven Vercel/Railway deploy troubleshooting. |
| [`domain`](plugins/domain/) | development | The project's tribal knowledge: architecture orientation, copilot/AI-gateway safety invariants, realtime-collaboration (Yjs/Hocuspocus) rules, and the read-only `knowtis-architect` agent. |

Each plugin is versioned in its `.claude-plugin/plugin.json` with a matching `CHANGELOG.md`.

## Other agents (Codex, OpenCode, Cursor, Gemini)

Codex, Cursor, Gemini CLI, and OpenCode don't consume Claude Code plugins. Vendor the same open [Agent Skills](https://agentskills.io) content into the Knowtis repository instead:

```bash
node scripts/sync-agents.mjs --install-repo /path/to/knowtis-app
```

Re-running is idempotent: the tamper-evident ownership manifest refuses locally modified or unrelated skills, records the source revision and content hashes, and prunes stale names. Dirty source trees are marked in that revision. The manifest protects against accidental replacement; it is not a security boundary against a user who can rewrite both installed content and its manifest. `--check <repo>` verifies skills plus the generated OpenCode agent. `--output <dir>` replaces only the generated `.agents` and `.opencode` trees and should target a dedicated output directory. Use `--uninstall-global` once when migrating an older user-global installation.

| Tool | Reads skills from |
| --- | --- |
| Codex CLI | `.agents/skills/` |
| Cursor | `.agents/skills/` |
| Gemini CLI | `.agents/skills/` |
| OpenCode | `.agents/skills/` |

## Prerequisites

Plugins never bundle credentials or connection strings. `db-ops` expects either a user-configured Postgres MCP server (`pg-knowtis-local` / `pg-knowtis-prod`) or `psql` with `DATABASE_URL` exported from your own environment.

## Maintenance

See [CONTRIBUTING.md](CONTRIBUTING.md) for validation, versioning, and canonical
documentation rules. Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).
