# React Operations Console Design

## Goal

Build the single judge-facing page defined by `HACKATHON_MVP.md`. It must make the unsafe conflict, CockroachDB memory retrieval, concurrent Safe commit, durable decision evidence, and resulting episodic memory understandable without requiring judges to inspect logs.

## Product Flow

The page opens in an explicit ready state and shows the canonical lost-package fixture. The operator selects Safe or Unsafe and Mock or Bedrock, then uses Reset and Run. One completed API response supplies the entire trace; the UI presents and lightly animates that trace without WebSockets.

Unsafe mode must prominently state `DEMO-ONLY / UNSAFE`, show both proposals as accepted mock actions, and never imply a durable database decision. Safe mode must show one `COMMITTED`, one `ALREADY_COMMITTED`, the final case version, decision evidence, outbox intent, and stored episodic memory.

## Architecture

Create `apps/web` as a React 19 + Vite 8 workspace. All browser-to-backend calls go through `src/lib/api.ts`. That module validates API envelopes with Zod and returns typed data or a sanitized `DemoApiError`. It reads a build-time `VITE_API_URL`; no database or AWS secret enters the browser.

`src/lib/fixture-api.ts` provides deterministic Safe/Unsafe responses only when `VITE_USE_FIXTURES=true`. This mode is explicit in both configuration and the UI; production never falls back to it after an HTTP failure.

`useDemoConsole` owns selected mode, agent mode, pending operation, result, and error. Presentational components receive data and callbacks only. `App.tsx` composes the page and accepts a client override for integration tests.

## Visual System

Use a desktop-first operations console rather than a marketing dashboard. The canvas is graphite with subtly elevated slate panels. Warm amber/orange identifies transactional admission and CockroachDB; cyan identifies semantic memory; green identifies a committed result; coral/red identifies unsafe conflicts. Use Inter/system sans typography, compact uppercase labels, tabular numbers, restrained borders, and no gradients that reduce text contrast.

The top bar contains the Mutex Memory wordmark, runtime badge, Safe/Unsafe control, Mock/Bedrock control, Reset, and Run. The main grid contains Current Case and Agents on the first row, Retrieved Memory and Commit Result on the second, then full-width Decision Evidence and Timeline. At widths below 960px, panels stack into one column. Motion is limited to status transitions and respects `prefers-reduced-motion`.

## Data and Error States

- Ready: canonical fixture context with an instruction to reset or run.
- Loading: disable mutating controls and identify the current operation.
- Success: retain the full last trace until another operation completes.
- Error: show a sanitized inline alert; do not clear the last successful trace.
- Empty evidence: render a meaningful `Not committed in Unsafe mode` state.

The client validates UUIDs, enum states, numeric versions/distances, proposals, commit results, timeline events, decision evidence, outbox evidence, and episodic memory. Unexpected response shapes fail closed with `INVALID_API_RESPONSE`.

## Testing

Use Vitest, jsdom, and Testing Library. API tests exercise the real fetch boundary with deterministic responses. App tests click Reset/Run and assert the visible Safe/Unsafe story rather than internal React state. The production build must pass, followed by the monorepo typecheck, full suite, CockroachDB concurrency proof, and browser visual QA at desktop and narrow widths.

## Non-Goals

No authentication, chat UI, WebSockets, charts, settings, routing, generic admin pages, real refund/shipping actions, or MCP button. Amplify configuration may build and publish `apps/web/dist`, but live hosting is a later external deployment step.
