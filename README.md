# knowtis-plugins

Internal Claude Code plugin marketplace for the [Knowtis](https://github.com/jovandyaz/knowtis-app) platform.

## Install

Add the marketplace and install the plugins once (user scope) — same flow as any public Claude Code marketplace. They then load in every repo; skills only activate when their description matches the task, so they don't get in the way elsewhere.

```
/plugin marketplace add jovandyaz/knowtis-plugins
/plugin install domain@knowtis-plugins
/plugin install db-ops@knowtis-plugins
/plugin install delivery@knowtis-plugins
/plugin install standards@knowtis-plugins
```

## Plugins

| Plugin | Category | What it provides |
| --- | --- | --- |
| [`standards`](plugins/standards/) | development | Skills for TypeScript/testing conventions, the minimal-comments policy, and single-line Conventional Commits. |
| [`db-ops`](plugins/db-ops/) | database | Drizzle migration discipline (`generate` → commit → `migrate`, never `push` on shared DBs) and a read-only Postgres investigation contract. |
| [`delivery`](plugins/delivery/) | deployment | nx affected CI simulation, Graphite stacked-PR workflow, Vercel/Railway deploy runbooks, and a manual `/delivery:running-preflight` check. |
| [`domain`](plugins/domain/) | development | The project's tribal knowledge: architecture orientation, copilot/AI-gateway safety invariants, realtime-collaboration (Yjs/Hocuspocus) rules, and the read-only `knowtis-architect` agent. |

Each plugin is versioned in its `.claude-plugin/plugin.json` with a matching `CHANGELOG.md`.

## Other agents (Codex, OpenCode, Cursor, Gemini)

Codex, Cursor, Gemini CLI, and OpenCode don't use Claude Code plugins, but they read the open [Agent Skills](https://agentskills.io) `SKILL.md` format from `.agents/skills/`. Install these skills once, globally — the same once-and-done idea as the Claude Code install above:

```bash
node scripts/sync-agents.mjs --install-global    # -> ~/.agents/skills (all four tools, every repo)
```

Re-running is idempotent (it tracks what it owns via a manifest and prunes stale skills; other tools' skills are never touched). Other modes if you need them: `--install-repo <repo>` vendors the skills into one repo's `.agents/skills` and adds an OpenCode agent; `--check <repo>` reports drift; no flag emits to `dist/` for preview.

| Tool | Reads skills from |
| --- | --- |
| Codex CLI | `~/.agents/skills` (or `.agents/skills/` per project) |
| Cursor | `~/.agents/skills` · `.cursor/skills/` |
| Gemini CLI | `~/.agents/skills` (alias of `~/.gemini/skills/`) |
| OpenCode | `~/.agents/skills` (also reads `.claude/skills/`) |

**Degradation outside Claude Code**: the marketplace/plugin manifests are Claude Code-only; `allowed-tools` is ignored by OpenCode; `disable-model-invocation` (used by delivery's `running-preflight`) is honored only by Claude Code and Cursor — in other tools that skill is model-invocable.

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
