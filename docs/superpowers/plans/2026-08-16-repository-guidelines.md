# Repository Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a concise operational contributor guide at the repository root.

**Architecture:** `AGENTS.md` is the stable, scannable entry point for contributors and coding agents. It summarizes operational conventions and links to `CLAUDE.md`, `ARCHITECTURE.md`, and the active phase plan instead of duplicating them.

**Tech Stack:** Markdown, pnpm workspaces, strict TypeScript, Vitest, CockroachDB, AWS.

## Global Constraints

- Title the document `Repository Guidelines`.
- Keep the guide between 200 and 400 words.
- Distinguish current documentation from planned source directories.
- Treat `CLAUDE.md` as the detailed source of truth.
- Keep progress updates in phase plans, not in `AGENTS.md`.

---

### Task 1: Create the operational contributor guide

**Files:**
- Create: `AGENTS.md`
- Reference: `CLAUDE.md`
- Reference: `ARCHITECTURE.md`
- Reference: `docs/superpowers/plans/2026-08-16-phase-1-correctness-kernel.md`

**Interfaces:**
- Consumes: approved repository-guidelines design and existing project documentation.
- Produces: a Markdown guide for contributors and coding agents.

- [x] **Step 1: Create `AGENTS.md`**

Include short sections for repository structure, commands, coding conventions, testing, commits and pull requests, and security/agent instructions. State that the source layout and commands become applicable as Phase 1 scaffolding lands.

- [x] **Step 2: Verify structure and length**

Run:

```powershell
$text = Get-Content -Raw AGENTS.md
($text -split '\s+' | Where-Object { $_ }).Count
rg -n '^#|pnpm|CLAUDE.md|50 concurrent|CockroachDB|AWS' AGENTS.md
```

Expected: the word count is 200–400; the title and required operational topics are present.

- [x] **Step 3: Inspect the final file**

Run:

```powershell
Get-Content -Raw AGENTS.md
```

Expected: concise professional instructions with no placeholders and no claim that planned source directories already exist.

- [ ] **Step 4: Commit when Git metadata is available**

Not run in this workspace copy: no Git repository metadata is available.

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-16-repository-guidelines-design.md docs/superpowers/plans/2026-08-16-repository-guidelines.md
git commit -m "docs: add repository contributor guidelines"
```
