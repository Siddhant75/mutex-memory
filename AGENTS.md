# Repository Guidelines

## Project Structure & Module Organization

This pnpm TypeScript monorepo keeps schemas in `packages/contracts/`, commit policy in `packages/domain/`, CockroachDB access in `packages/db/`, model adapters in `packages/agents/`, Safe/Unsafe orchestration in `packages/demo/`, and the Lambda-compatible JSON API in `services/api/`. Tests stay beside each workspace under `test/`; the 50-way proof is `scripts/run-concurrency-test.ts`. Phase 1 is frozen. For later work, `HACKATHON_MVP.md` is authoritative over `CLAUDE.md`. Keep implementation plans under `docs/superpowers/plans/` and deployables under `apps/`, `services/`, or `infra/`.

## Build, Test, and Development Commands

- `pnpm install` — install workspace dependencies.
- `pnpm -r typecheck` — typecheck every workspace package.
- `pnpm test` — run all unit and live database integration tests once.
- `pnpm test:integration` — run only the CockroachDB repository suite.
- `pnpm test:concurrency` — prove that 50 concurrent candidates produce one decision and one outbox row.

Use `TEST_DATABASE_URL` in `.env.test.local` for database commands. Never use a production database for destructive integration resets.

## Coding Style & Naming Conventions

Use strict TypeScript with two-space indentation and no `any`. Name types and Zod schemas in `PascalCase`, functions and variables in `camelCase`, and files in `kebab-case`. Validate external inputs, queue messages, and model outputs with Zod. Keep transaction callbacks deterministic and database-only; never place model calls or external effects inside them. Route SQLSTATE `40001` retries exclusively through the shared retry wrapper.

## Testing Guidelines

Use Vitest. Name tests `*.test.ts`; mark database suites `*.integration.test.ts` and place shared setup under `test/support/`. Every change must preserve the single-resolution, stale-version, atomic-outbox, and idempotency invariants. Write the failing test first, then run the relevant focused suite before the full gate.

## Commit & Pull Request Guidelines

Git history is unavailable in this snapshot; the approved plan uses Conventional Commit prefixes such as `feat:`, `test:`, and `docs:`. Keep commits narrowly scoped. PRs should explain the behavior and affected invariant, link an issue when available, list verification commands and results, and include screenshots for UI changes.

## Security & Agent Instructions

Never commit database URLs, AWS credentials, certificates, or populated `.env` files; use AWS Secrets Manager in deployed environments. Before editing, read `CLAUDE.md` and the active phase plan. Maintain meaningful use of at least two eligible CockroachDB tools and one AWS service. Record changing progress in plans, not in this stable guide.
