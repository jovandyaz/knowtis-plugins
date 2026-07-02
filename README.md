# knowtis-plugins

Internal Claude Code plugin marketplace for the [Knowtis](https://github.com/jovandyaz/knowtis-app) platform.

## Install

```
/plugin marketplace add jovandyaz/knowtis-plugins
/plugin install domain@knowtis-plugins
```

Working inside the `knowtis` repo, the marketplace and plugins are auto-registered through `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`) — trusting the folder is enough.

## Plugins

| Plugin | Category | What it provides |
| --- | --- | --- |
| [`standards`](plugins/standards/) | development | Minimal-comments PostToolUse hook, plus skills for TypeScript/testing conventions and single-line Conventional Commits. |
| [`db-ops`](plugins/db-ops/) | database | Drizzle migration discipline (`generate` → commit → `migrate`, never `push` on shared DBs) and a read-only Postgres investigation contract. |
| [`delivery`](plugins/delivery/) | deployment | nx affected CI simulation, Graphite stacked-PR workflow, Vercel/Railway deploy runbooks, and a manual `/delivery:running-preflight` check. |
| [`domain`](plugins/domain/) | development | The project's tribal knowledge: architecture orientation, copilot/AI-gateway safety invariants, realtime-collaboration (Yjs/Hocuspocus) rules, and the read-only `knowtis-architect` agent. |

Each plugin is versioned in its `.claude-plugin/plugin.json` with a matching `CHANGELOG.md`.

## Other agents (Codex, OpenCode, Cursor, Gemini)

Skills use the open [Agent Skills](https://agentskills.io) `SKILL.md` format and sync into `.agents/skills/`, which Codex, Cursor, Gemini CLI, and OpenCode discover natively. Sync them with:

```bash
node scripts/sync-agents.mjs                          # emit to dist/ (preview)
node scripts/sync-agents.mjs --install-repo <repo>    # <repo>/.agents/skills + .opencode/agents
node scripts/sync-agents.mjs --install-global         # ~/.agents/skills (all tools, all repos)
node scripts/sync-agents.mjs --check <repo>           # drift check (exit 1 on diff)
```

| Tool | Discovers synced skills at | Notes |
| --- | --- | --- |
| Codex CLI | `.agents/skills/` (project) · `~/.agents/skills` | Skills only — no agent/command formats |
| OpenCode | `.agents/skills/` (also reads `.claude/skills/`) | Also gets `knowtis-architect` as `.opencode/agents/knowtis-architect.md` |
| Cursor | `.agents/skills/` · `.cursor/skills/` | Honors `disable-model-invocation` and `paths` |
| Gemini CLI | `.agents/skills/` (alias of `.gemini/skills/`) | — |

Claude Code isn't in the table because it loads the plugins directly and doesn't read `.agents/`.

The sync writes a `.knowtis-plugins-manifest.json` next to the installed skills so re-runs update only what this marketplace owns (foreign skills, e.g. Nx's, are never touched) and stale skills are pruned.

**Degradation outside Claude Code**: the `standards` hook (PostToolUse) and the marketplace/plugin manifests are Claude Code-only; `allowed-tools` is ignored by OpenCode; `disable-model-invocation` (used by delivery's `running-preflight`) is honored only by Claude Code and Cursor — in other tools that skill is model-invocable.

## Prerequisites

Plugins never bundle credentials or connection strings. `db-ops` expects either a user-configured Postgres MCP server (`pg-knowtis-local` / `pg-knowtis-prod`) or `psql` with `DATABASE_URL` exported from your own environment.

## Contributing

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json` (semver `version` required), `README.md`, `CHANGELOG.md`, and `skills/<gerund-name>/SKILL.md`.
2. Register the plugin in `.claude-plugin/marketplace.json` (no `version` in the entry — it lives only in `plugin.json`).
3. Validate locally before pushing:

   ```bash
   claude plugin validate .
   for p in plugins/*/; do claude plugin validate "$p" --strict; done
   node scripts/validate-plugins.mjs
   ```

4. Any change under `plugins/<name>/` requires a strictly-greater version bump in its `plugin.json` **and** a `CHANGELOG.md` entry — CI enforces both.
5. Commits: single-line Conventional Commits with the plugin as scope, e.g. `feat(db-ops): add schema-map reference`.

Content under `references/` mirrors docs in the `knowtis` repo (`docs/MIGRATIONS.md`, `docs/AI.md`, …). The repo docs are canonical — re-sync references when bumping a plugin.
