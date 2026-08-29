# Changelog

All notable changes to the `delivery` plugin.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-08-29

### Changed

- Renamed `deploying-knowtis` to project-scoped `deploying`.
- Replaced the obsolete Graphite workflow with GitHub's `gh-stack` extension.
- Synchronized CI and deploy guidance with Nx v5 SHA detection, affected typechecking, backoffice, migration drift checks, and gated Railway deploys.
- Added eval cases for deploy and preflight behavior.

## [0.1.2] - 2026-07-02

### Changed

- docs: move the cross-tool preflight note to the marketplace README; trim maintainer-only notes.

## [0.1.1] - 2026-07-02

### Changed

- Documented that `running-preflight`'s manual-only gate (`disable-model-invocation`) applies in Claude Code and Cursor; other tools treat it as model-invocable.

## [0.1.0] - 2026-07-02

### Added

- `running-affected-ci` skill with the CI pipeline reference.
- `stacking-prs` skill (Graphite + CodeRabbit workflow).
- `deploying-knowtis` skill with the deployment runbook (from `docs/DEPLOYMENT.md`).
- `running-preflight` manual-only skill with SHIP/NO-SHIP verdict.
