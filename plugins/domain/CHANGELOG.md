# Changelog

All notable changes to the `domain` plugin.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-08-30

### Changed

- Expand `wiring-realtime-collaboration` triggers around duplicated, missing, stale, or overwritten note content; guest/share-link editing; and REST/MCP-to-Yjs synchronization.
- Add diagnostic guidance and eval contracts for multiple content writers, StrictMode reproduction, and guest edit authorization.
- Align orientation guidance with Railway CLI watch-pattern and `SKIPPED` behavior.

## [0.2.1] - 2026-08-30

### Changed

- License the plugin and its portable skills under MIT.
- Synchronize MCP authentication/tooling guidance and canonical documentation references.

## [0.2.0] - 2026-08-29

### Changed

- Renamed `orienting-in-knowtis` to project-scoped `orienting` and narrowed its triggers around the Nx skills.
- Synchronized the architecture map with backoffice, OAuth data access, and all 18 `@knowtis/*` aliases.
- Added realtime-collaboration eval cases.
- Documented forced BYOK recovery and the zero-length external Yjs update guard.

## [0.1.1] - 2026-07-02

### Changed

- docs: trim maintainer-only notes from README.

## [0.1.0] - 2026-07-02

### Added

- `orienting-in-knowtis` skill: architecture map, alias namespaces, Nx boundaries, footguns.
- `building-copilot-features` skill: copilot/AI-gateway safety invariants, module map, eval workflow.
- `wiring-realtime-collaboration` skill: Yjs/Hocuspocus handshake, persistence, and broadcast invariants.
- `knowtis-architect` agent: read-only domain expert for design review and architecture Q&A.
