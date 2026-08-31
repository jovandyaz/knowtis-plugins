# delivery

How Knowtis code is verified and shipped: CI readiness, PR stacking, and deploy diagnosis.

## Components

| Component | Type | Purpose |
| --- | --- | --- |
| `stacking-prs` | Skill | GitHub-native `gh-stack` workflow, CodeRabbit-first review, branch conventions. |
| `deploying` | Skill | Nx-affected CI simulation, complete readiness checks, CI-driven Vercel/Railway deploy mechanics, health checks, and troubleshooting. |
