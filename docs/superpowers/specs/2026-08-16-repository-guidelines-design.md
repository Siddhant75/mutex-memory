# Repository Guidelines Design

## Goal

Create a concise `AGENTS.md` that helps contributors and coding agents work safely in the Mutex Memory repository without duplicating the detailed architecture in `CLAUDE.md`.

## Document Structure

The guide will be titled **Repository Guidelines** and remain between 200 and 400 words. It will contain:

1. **Project Structure & Module Organization** — distinguish the current documentation-only snapshot from the planned pnpm monorepo, naming representative `apps/`, `services/`, `packages/`, `infra/`, `scripts/`, and `docs/` paths.
2. **Build, Test, and Development Commands** — list the planned Phase 1 commands from the approved implementation plan, including installation, typechecking, Vitest, and the concurrency proof.
3. **Coding Style & Naming Conventions** — require strict TypeScript, no `any`, Zod validation, deterministic transaction callbacks, and repository-consistent kebab-case filenames.
4. **Testing Guidelines** — describe Vitest test naming, CockroachDB integration-test configuration, and the mandatory 50-way concurrency invariant.
5. **Commit & Pull Request Guidelines** — use the Conventional Commit patterns already specified in the Phase 1 plan and require focused descriptions plus verification evidence.
6. **Security & Agent Instructions** — keep credentials out of Git, preserve the CockroachDB/AWS architectural invariants, follow the active phase plan, and keep changing progress out of `AGENTS.md`.

## Source-of-Truth Policy

`AGENTS.md` will serve as the short operational entry point. It will explicitly direct contributors to `CLAUDE.md` for full architecture, invariants, error-handling contracts, and scope rules. `ARCHITECTURE.md` remains the system design reference, while `docs/superpowers/plans/` contains executable phase plans and evolving progress.

## Success Criteria

The result is accurate for the current repository snapshot, avoids claiming that planned source directories already exist, reflects the live Devpost requirement for meaningful CockroachDB and AWS integration, and is concise enough to scan before making changes.
