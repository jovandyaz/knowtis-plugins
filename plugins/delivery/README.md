# delivery

How Knowtis code ships: CI simulation, PR stacking, and deploy runbooks.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `running-affected-ci` | Skill | Simulate the nx-affected pipeline locally; interpret which checks and deploy jobs a change triggers. |
| `stacking-prs` | Skill | Graphite stacked-PR workflow, CodeRabbit-first review, branch conventions. |
| `deploying-knowtis` | Skill | CI-driven Vercel/Railway deploy mechanics, env vars, health checks, troubleshooting. |
| `running-preflight` | Skill (manual-only) | `/delivery:running-preflight` — full local verification with a SHIP/NO-SHIP verdict. Not model-invocable: it runs the whole test suite, so it fires only when you ask. |

## Canonical sources

References mirror `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`, and the CI/CD sections of `CLAUDE.md` in the knowtis repo. Repo docs stay canonical — re-sync on version bumps.
