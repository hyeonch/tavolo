# Branching Workflow

Before starting a new Linear issue:

```bash
git switch main
git pull
git switch -c feature/<issue-id>
```

Rules:

- Create issue branches from updated `main`.
- If a branch appears unmerged locally, update `main` from origin before deciding that work is blocked or stacked.
- Do not create a feature branch from another feature branch.
- Use the Linear branch name when available, for example `feature/tvl-9`.
- Do not stack issue branches unless the user explicitly asks for stacked work.
- If local work exists, inspect it first and do not discard it without explicit user approval.
- If the current branch is not based on `main`, stop and ask before continuing.
- Split commits by meaningful scope when a task includes multiple kinds of changes, such as wiki/process updates and product implementation.
