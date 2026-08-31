# Contributing

## Plugin changes

1. Create or update `plugins/<name>/` with its manifest, README, changelog, and
   gerund-named skills.
2. Register new plugins in `.claude-plugin/marketplace.json`; plugin versions
   live only in each `plugin.json`.
3. Bump the affected plugin's strict semantic version and add the matching first
   changelog entry.
4. Treat the Knowtis repository docs and code as canonical. Re-sync mirrored
   references whenever the corresponding behavior changes.

## Verification

Use Node.js 22.20 or newer and pnpm.

```bash
pnpm dlx @anthropic-ai/claude-code@2.1.251 plugin validate .
for p in plugins/*/; do pnpm dlx @anthropic-ai/claude-code@2.1.251 plugin validate "$p" --strict; done
node scripts/validate-plugins.mjs
node --test scripts/sync-agents.test.mjs
node scripts/sync-agents.mjs
node scripts/sync-agents.mjs --check dist
```

Commit messages are single-line Conventional Commits with the plugin as scope
when applicable, for example `feat(db-ops): add schema-map reference`.
