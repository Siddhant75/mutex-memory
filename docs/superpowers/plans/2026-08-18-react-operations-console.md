# React Operations Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page React operations console that renders the complete Safe/Unsafe Mutex Memory demo from the existing Lambda API.

**Architecture:** A Zod-validated API client and explicit fixture client feed a small controller hook. Focused presentation components render the case, agents, vector memories, commit outcomes, durable evidence, and timeline without streaming infrastructure.

**Tech Stack:** React 19.2.8, React DOM 19.2.8, Vite 8.2.1, `@vitejs/plugin-react` 6.0.5, Zod 4.4.3, Lucide React 1.31.0, Vitest 4.1.10, Testing Library React 16.3.2, jest-dom 7.0.1, jsdom 30.0.1.

**Spec:** `docs/superpowers/specs/2026-08-18-react-operations-console-design.md`

## Global Constraints

- Use strict TypeScript with no `any` and two-space indentation.
- Route every browser API call through `apps/web/src/lib/api.ts`.
- Never expose database URLs, AWS credentials, certificates, or server errors in the browser.
- Fixture mode activates only when `VITE_USE_FIXTURES=true` and must be visibly labeled.
- Unsafe mode is always labeled `DEMO-ONLY / UNSAFE` and shows no durable decision.
- Safe mode visibly shows exactly one `COMMITTED` and one `ALREADY_COMMITTED` for the canonical run.
- Keep the frontend to one page and do not add P1/P2 features.

---

### Task 1: Frontend Foundation and API Client

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/vite-env.d.ts`
- Create: `apps/web/src/lib/api.ts`
- Test: `apps/web/src/lib/api.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `DemoApiClient` with `reset(): Promise<DemoTrace>` and `run(input: RunInput): Promise<DemoRunTrace>`.
- Produces: `createHttpDemoApiClient(baseUrl, fetchImpl?)` and validated frontend evidence types.

- [x] Write API-client tests proving route/body construction, envelope validation, and sanitized errors.
- [x] Run the focused tests and confirm they fail because the client does not exist.
- [x] Add the web workspace configuration and exact dependencies.
- [x] Implement the minimal Zod schemas and HTTP client.
- [x] Run focused tests and `pnpm --filter @mutex-memory/web typecheck`.

### Task 2: Explicit Fixture Client and Controller

**Files:**
- Create: `apps/web/src/lib/fixture-api.ts`
- Create: `apps/web/src/lib/fixture-api.test.ts`
- Create: `apps/web/src/use-demo-console.ts`
- Test: `apps/web/src/use-demo-console.test.tsx`

**Interfaces:**
- Consumes: `DemoApiClient`, `DemoMode`, `AgentMode`, `DemoRunTrace` from Task 1.
- Produces: `createFixtureDemoApiClient()` and `useDemoConsole(client)` state/actions.

- [x] Write tests for deterministic Safe/Unsafe fixture traces and controller state preservation on failure.
- [x] Run focused tests and confirm the missing-feature failures.
- [x] Implement the fixture client with canonical UUIDs and evidence.
- [x] Implement the controller with selected modes, reset/run operations, pending state, and sanitized error state.
- [x] Run focused tests and web typecheck.

### Task 3: Operations Console Components

**Files:**
- Create: `apps/web/src/components/console-header.tsx`
- Create: `apps/web/src/components/case-panel.tsx`
- Create: `apps/web/src/components/agents-panel.tsx`
- Create: `apps/web/src/components/memory-panel.tsx`
- Create: `apps/web/src/components/result-panel.tsx`
- Create: `apps/web/src/components/evidence-panel.tsx`
- Create: `apps/web/src/components/timeline-panel.tsx`
- Create: `apps/web/src/app.tsx`
- Test: `apps/web/src/app.test.tsx`

**Interfaces:**
- Consumes: controller state/actions from Task 2.
- Produces: `App({ client, fixtureMode })`, the single judge-facing screen.

- [ ] Write interaction tests proving Reset, Unsafe, and Safe stories are visible and accessible.
- [ ] Run focused tests and confirm missing-component failures.
- [ ] Implement the header and seven evidence panels with semantic HTML.
- [ ] Compose the panels in `App` and keep operation errors inline.
- [ ] Run focused tests and web typecheck.

### Task 4: Visual System and Entrypoint

**Files:**
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/.env.example`
- Modify: `apps/web/src/app.test.tsx`

**Interfaces:**
- Consumes: `App` and API factories.
- Produces: a Vite application selected by `VITE_API_URL` and `VITE_USE_FIXTURES`.

- [ ] Add tests proving fixture mode is explicitly labeled and reduced-data states remain readable.
- [ ] Implement graphite/amber/cyan visual tokens, responsive grid, focus states, status motion, and reduced-motion behavior.
- [ ] Wire `main.tsx` to fixture mode only on exact opt-in; otherwise require `VITE_API_URL`.
- [ ] Run web tests, typecheck, and production build.

### Task 5: Hosting and End-to-End Verification

**Files:**
- Create: `amplify.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `apps/web` production build.
- Produces: Amplify build instructions with artifact directory `apps/web/dist`.

- [ ] Add the Amplify monorepo build definition and document frontend environment variables.
- [ ] Run `pnpm --filter @mutex-memory/web build` and inspect `apps/web/dist`.
- [ ] Run monorepo typecheck, all tests, and `pnpm test:concurrency`.
- [ ] Start Vite fixture mode and use the approved in-app browser to verify desktop and narrow layouts plus Safe/Unsafe interactions.
- [ ] Initialize/publish the GitHub repository only after a final secret scan and successful verification.
