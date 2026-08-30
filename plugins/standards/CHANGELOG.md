# Changelog

All notable changes to the `standards` plugin.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.2] - 2026-08-30

### Changed

- License the plugin and its portable skills under MIT.
- Align minimal-comments and database-test guidance with current Knowtis enforcement.

## [0.2.1] - 2026-08-14

### Changed

- Point the docs at where minimal-comments enforcement actually lives. It moved from a repo-local PostToolUse hook in knowtis to a user-level PreToolUse hook (`~/.claude/hooks/comment-policy.cjs`) that blocks the write in every repo, plus a `knowtis/minimal-comments` ESLint rule for CI. A PostToolUse hook cannot block — it only reports after the file is already written.
- Cite the sources the policy comes from (Clean Code ch. 4, Google TypeScript Style Guide) instead of presenting it as a house convention.
- Add the two categories the policy was missing: informative labels on opaque literals, and the ban on multi-line `/* */` blocks.
- Raise the comment-length gate from 3 lines to 6, matching what is enforced.

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
