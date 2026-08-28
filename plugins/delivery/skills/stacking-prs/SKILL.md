---
name: stacking-prs
description: Manages the Knowtis pull-request workflow — GitHub-native stacked PRs (gh-stack), CodeRabbit-first review, and branch conventions. Use when creating a PR, splitting a large change into a stack, responding to review, or when asked "cómo abro el PR", "stack", "gh stack", or "CodeRabbit". Not for commit-message formatting (use standards' writing-conventional-commits).
---

# Stacking PRs (GitHub native + CodeRabbit)

Knowtis uses **GitHub's native stacked pull requests** (public preview since 2026-07-30) and **CodeRabbit** for automated first-pass review. Graphite was retired on 2026-08-28 to drop a dependency: the native feature rebases and retargets a stack on GitHub's own servers when a layer merges, which is the only thing Graphite was doing for us.

## Setup (once per machine)

```bash
gh extension install github/gh-stack
```

## Workflow

1. Branch with a Conventional prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`.
2. Build the stack bottom-up. Either track it locally from the start — `gh stack init`, `gh stack add <branch>`, `gh stack submit` — or open each PR with `gh pr create --base <branch below>` and adopt the chain afterwards with `gh stack link <bottom> … <top>` (PR numbers or branch names, bottom first). `link` needs no local tracking and never removes PRs from an existing stack.
3. **Keep every PR under 100 changed files** — CodeRabbit refuses larger ones ("Review skipped: N files exceed the limit of 100") and the cap is not configurable. Check with `git diff --name-only <base> <head> | wc -l` before opening.
4. CodeRabbit reviews stacked PRs too (`.coderabbit.yaml` `base_branches` matches Conventional-prefixed bases). It does **not** auto-trigger on this repo: comment `@coderabbitai full review`, then count inline comments via the API — a green check with zero comments is a skipped review, not a clean one. The fair-usage limit does not queue; re-trigger after the window it names.
5. **Address CodeRabbit before requesting human review** — an unresolved thread is a not-ready signal.
6. Merge bottom-up. `gh stack merge` lands everything up to a chosen PR atomically; merging one PR from the GitHub UI also works, and the layers above rebase and retarget automatically. Do not rebase a stacked branch by hand after a merge — let GitHub do it, then `gh stack sync` locally.
7. Detailed context lives in the PR description; commits stay single-line (see the standards plugin).

## Gotchas

- `gh stack view` needs local tracking; after `link`, run `gh stack checkout <stack-number>` first.
- `gh pr edit` is broken on this repo (deprecated GraphQL field). Change bases and bodies with `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH --input -`.
- Deleting a branch that is the **base** of an open PR auto-closes that PR, and GitHub then refuses both a base change and a reopen. Run `gh pr list --base <branch>` before deleting anything.
- Verify `gh auth status` shows the intended account before every write.

## Rules of thumb

- A PR that mixes a refactor with a behavior change should be split into a stack (refactor below, behavior on top).
- Merge in order; never a mid-stack PR first.
- CI must be green per PR; `nx affected` keeps each stack level cheap.
