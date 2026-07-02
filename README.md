# knowtis-plugins

Internal Claude Code plugin marketplace for the [Knowtis](https://github.com/jovandyaz/knowtis-app) platform. Plugin names are unprefixed (`standards`, not `knowtis-standards`) — the marketplace already namespaces them: every install key is `<plugin>@knowtis-plugins`.

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

Versions live in each plugin's `.claude-plugin/plugin.json` (single source of truth) with a matching `CHANGELOG.md`.

## Other agents (Codex, OpenCode, Cursor, …)

Skills are authored in the open [Agent Skills](https://code.claude.com/docs/en/skills) `SKILL.md` format, so they are consumable outside Claude Code. Export a flat, tool-agnostic skills tree with:

```bash
node scripts/export-skills.mjs            # -> dist/skills/<skill-name>/
```

Point OpenCode/Codex/Cursor at `dist/skills/` (or copy it into a repo's `.agents/skills/`). Claude Code-only components degrade cleanly elsewhere: the marketplace/plugin manifests, the `standards` hook, and the `knowtis-architect` agent definition.

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
