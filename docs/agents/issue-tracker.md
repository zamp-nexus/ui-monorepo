# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Repository

The repository is `ch-nexus/ui-monorepo`. Infer it from `git remote -v`; `gh`
does this automatically when run inside this clone.

### Where older issue numbers point

Issue references numbered **#9–#45** — in commit messages and in governed
documents — refer to `openzentra/nexus`, which remains the historical record for
Phase 2. They were written before the move and are not renumbered here.

This matters because GitHub resolves `#NN` against whichever repository you are
viewing. Left unstated, a citation like `Closes #22` would quietly point at an
unrelated issue in this repo rather than at the evidence it names — and a link
that resolves to the wrong thing is worse than one that breaks, because nothing
looks amiss.

The old remote is retained as `openzentra` for exactly this reason:

```
git remote -v
openzentra  git@github-personal:openzentra/nexus.git
```

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: use `gh issue list` with the appropriate state and label
  filters and request structured JSON when processing results.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: use `gh issue edit <number> --add-label "..."`
  or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. When a bare
reference such as `#42` is ambiguous, resolve it before acting.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The map is one GitHub issue and its tickets are child issues.

- **Map**: an issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- **Child ticket**: a GitHub sub-issue linked to the map and labelled
  `wayfinder:<type>`, where type is `research`, `prototype`, `grilling`, or
  `task`.
- **Blocking**: use GitHub native issue dependencies. Fall back to a
  `Blocked by: #<n>` line only when dependencies are unavailable.
- **Frontier**: choose the first open, unblocked, unassigned child in map order.
- **Claim**: assign the issue to the current user before beginning writes.
- **Resolve**: add the answer as a comment, close the child issue, and append a
  concise context pointer to the map's Decisions-so-far section.
