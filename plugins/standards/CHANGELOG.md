# Changelog

All notable changes to the `standards` plugin.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-07-02

### Removed

- The PostToolUse minimal-comments hook. Enforcement stays repo-local in knowtis (`.claude/hooks/check-comments.mjs`) to avoid double-firing when this plugin is installed globally; the plugin now ships conventions as skills only.

## [0.1.1] - 2026-07-02

### Changed

- docs: trim maintainer-only notes from README.

## [0.1.0] - 2026-07-02

### Added

- PostToolUse hook `check-comments.mjs` enforcing the minimal-comments rule on TS/TSX/JS/JSX edits (ported from the knowtis repo's `.claude/hooks/`).
- `reviewing-code-standards` skill with TypeScript, testing, and comments-policy references.
- `writing-conventional-commits` skill for single-line Conventional Commits and branch naming.
