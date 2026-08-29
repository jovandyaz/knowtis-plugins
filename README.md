# knowtis-plugins

Internal agent-skill distribution for the [Knowtis](https://github.com/jovandyaz/knowtis) platform.

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
    "delivery@knowtis-plugins": true,
    "standards@knowtis-plugins": true
  }
}
```

## Plugins

| Plugin | Category | What it provides |
| --- | --- | --- |
| [`standards`](plugins/standards/) | development | Skills for TypeScript/testing conventions, the minimal-comments policy, and single-line Conventional Commits. |
| [`db-ops`](plugins/db-ops/) | database | Drizzle migration discipline (`generate` → commit → `migrate`, never `push` on shared DBs) and a read-only Postgres investigation contract. |
| [`delivery`](plugins/delivery/) | deployment | Nx-affected CI simulation, GitHub-native stacked PRs, Vercel/Railway deploy runbooks, and a manual `/delivery:running-preflight` check. |
| [`domain`](plugins/domain/) | development | The project's tribal knowledge: architecture orientation, copilot/AI-gateway safety invariants, realtime-collaboration (Yjs/Hocuspocus) rules, and the read-only `knowtis-architect` agent. |

Each plugin is versioned in its `.claude-plugin/plugin.json` with a matching `CHANGELOG.md`.

## Other agents (Codex, OpenCode, Cursor, Gemini)

Codex, Cursor, Gemini CLI, and OpenCode don't consume Claude Code plugins. Vendor the same open [Agent Skills](https://agentskills.io) content into the Knowtis repository instead:

```bash
node scripts/sync-agents.mjs --install-repo ../knowtis
```

Re-running is idempotent: the ownership manifest prevents overwriting unrelated skills, records content hashes, and prunes stale names. `--check <repo>` verifies skills plus the generated OpenCode agent; no flag emits a preview to `dist/`. Use `--uninstall-global` once when migrating an older user-global installation.

| Tool | Reads skills from |
| --- | --- |
| Codex CLI | `.agents/skills/` |
| Cursor | `.agents/skills/` |
| Gemini CLI | `.agents/skills/` |
| OpenCode | `.agents/skills/` |

**Degradation outside Claude Code**: plugin manifests are Claude Code-only. The portable sync strips Claude-only frontmatter such as `disable-model-invocation`, so non-Claude tools can invoke `running-preflight` automatically.

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
   node scripts/sync-agents.mjs
   node scripts/sync-agents.mjs --check dist
   ```

4. Any change under `plugins/<name>/` requires a strictly-greater version bump in its `plugin.json` **and** a `CHANGELOG.md` entry — CI enforces both.
5. Commits: single-line Conventional Commits with the plugin as scope, e.g. `feat(db-ops): add schema-map reference`.

Content under `references/` mirrors docs in the `knowtis` repo (`docs/MIGRATIONS.md`, `docs/AI.md`, …). The repo docs are canonical — re-sync references when bumping a plugin.
