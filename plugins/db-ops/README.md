# db-ops

Knowtis database operations: schema evolution and safe data investigation.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `managing-drizzle-migrations` | Skill | The generate → commit → migrate workflow, never-push rule, Railway pre-deploy application, baselines, zero-downtime patterns. |
| `investigating-postgres` | Skill | Read-only (SELECT/WITH only) data investigations with schema-first planning and PII redaction. Ships evals (`skills/investigating-postgres/evals/evals.json`). |

## Prerequisites

Database access comes from YOUR environment, never from this plugin:

- A configured Postgres MCP server (`pg-knowtis-local` / `pg-knowtis-prod`), **or**
- `psql` with `DATABASE_URL` exported in your shell.

No connection strings, credentials, or secret-manager paths ship in this plugin.
