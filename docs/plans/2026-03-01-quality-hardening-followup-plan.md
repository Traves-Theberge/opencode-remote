# Implementation Plan: Quality Hardening Follow-up (CLI/TUI/Daemon)

Created: 2026-03-01
Status: Planned
Owner: Traves + OpenCode Agent

## Purpose

Close the highest-impact quality and maintainability gaps identified in the end-to-end review, with priority on type safety, lint coverage, deterministic behavior tests, and workspace correctness.

## Success Criteria

- TypeScript linting runs against all TS sources/workspaces.
- Root app can run with strictness re-enabled (or a clearly scoped temporary exception list).
- Advanced control-plane namespaces have execution + adapter contract tests.
- CLI/TUI consume bridge as a workspace package import path (not relative source paths).
- TUI paging is bounded and operator feedback is explicit.
- CLI setup validates critical config fields before save.

## Scope

In scope:

- Lint/TS config hardening
- Adapter/executor testing expansion for `model/tools/mcp/skills/opencode`
- Workspace import and packaging correctness
- TUI and CLI UX hardening
- Policy guard implementation proposal hooks

Out of scope:

- new feature namespaces
- distributed deployment architecture
- cloud management plane

## Workstream Plan and TODO Lists

### 1) Lint Coverage and CI Quality Gate

Goal: ensure lint actually validates TypeScript code and workspace apps/packages.

Tasks:

- [ ] Update root lint script to target TS paths:
  - `src/**/*.ts`
  - `tests/**/*.ts`
  - `apps/**/*.ts`
  - `packages/**/*.ts`
- [ ] Update `eslint.config.js` file globs to TS files.
- [ ] Add TypeScript-aware lint baseline (parser/plugins if needed).
- [ ] Validate `npm run verify` still passes.
- [ ] Add docs note for lint scope in README/scripts section.

Deliverable:

- TS linting enforced and proven by verify.

---

### 2) Root Strict TypeScript Re-enable

Goal: align implementation with strict TS quality standard.

Tasks:

- [ ] Enable strict compiler options in root `tsconfig.json`:
  - `strict: true`
  - `noImplicitAny: true`
  - `noUncheckedIndexedAccess: true`
  - `noFallthroughCasesInSwitch: true`
- [ ] Fix resulting type errors in daemon core modules (`src/`).
- [ ] Minimize/contain unsafe casts in adapter boundary.
- [ ] Add temporary, explicit typed wrappers where SDK typing is loose.
- [ ] Re-run full verify and workspace typechecks.

Deliverable:

- Root strict TS re-enabled with passing checks.

---

### 3) Namespace Execution and SDK Contract Tests

Goal: prove deterministic namespace behavior beyond parser coverage.

Tasks:

- [ ] Add executor unit tests for each namespace intent:
  - `model.status`, `model.list`, `model.set`
  - `tools.ids`, `tools.list`
  - `mcp.status`, `mcp.add`, `mcp.connect`, `mcp.disconnect`
  - `skills.list`
  - `opencode.status/providers/commands/diagnostics`
- [ ] Add adapter contract tests with SDK call stubs/mocks:
  - validate request shape and response mapping
  - validate error handling and user-facing messages
- [ ] Add negative tests for missing args and policy violations.
- [ ] Add regression tests to ensure legacy commands still behave unchanged.

Deliverable:

- Execution-level confidence for all advanced control-plane namespaces.

---

### 4) Workspace Import and Packaging Correctness

Goal: remove brittle relative imports from CLI/TUI to bridge sources.

Tasks:

- [ ] Replace direct source imports in CLI/TUI with workspace package import:
  - `@opencode-remote/bridge`
- [ ] Ensure package exports are correct for runtime + typecheck.
- [ ] Verify scripts work from root and workspace context.
- [ ] Add smoke tests for:
  - `npm run cli -- status`
  - `npm run tui`

Deliverable:

- Stable workspace package boundaries and cleaner monorepo ergonomics.

---

### 5) TUI UX Hardening (Paging + Feedback)

Goal: make operator UX resilient and predictable under long outputs.

Tasks:

- [ ] Add bounded page navigation for timeline/output.
- [ ] Show current page + max page indicators.
- [ ] Add explicit empty/end-of-range messages.
- [ ] Add quick key legend section and context-sensitive hints.
- [ ] Add a refresh key action to reload stats/flow cleanly.

Deliverable:

- No unbounded paging behavior; clearer operator feedback.

---

### 6) CLI Onboarding Validation and Safety

Goal: prevent invalid setup persistence.

Tasks:

- [ ] Validate owner number using E.164 before save.
- [ ] Validate webhook URL format when webhook mode selected.
- [ ] Require token when Telegram enabled.
- [ ] Add `--dry-run` setup mode for preview without write.
- [ ] Add corresponding CLI tests for validation paths.

Deliverable:

- Safer onboarding with actionable errors.

---

### 7) Policy Guard Matrix Enforcement (Optional but Recommended)

Goal: align runtime behavior with documented safety/permission matrix.

Tasks:

- [ ] Define owner-only command set for high-risk admin/mutating namespaces.
- [ ] Enforce policy in router/executor before adapter calls.
- [ ] Add audit events for policy denials with clear reason.
- [ ] Add tests for owner vs non-owner command attempts.

Deliverable:

- Policy behavior matches docs and is test-backed.

## Dependencies

- SDK type fidelity at adapter boundary
- Existing test harness patterns in `tests/`
- Workspace runtime behavior for CLI/TUI scripts

## Risks and Mitigations

- Risk: strict mode uncovers broad legacy typing debt.
  - Mitigation: implement module-by-module strict pass with narrow, explicit wrappers.
- Risk: workspace import change breaks runtime resolution.
  - Mitigation: smoke-test root and workspace scripts after each change.
- Risk: policy changes alter expected user behavior.
  - Mitigation: document migration behavior and add clear denial messages.

## Suggested Execution Order

1. Lint coverage (Workstream 1)
2. Workspace import correctness (Workstream 4)
3. Strict TS re-enable (Workstream 2)
4. Namespace execution/adapter tests (Workstream 3)
5. TUI + CLI hardening (Workstreams 5 and 6)
6. Policy enforcement (Workstream 7)

## Milestones

- M1: Tooling baseline hardened (1 + 4 complete)
- M2: Type safety restored (2 complete)
- M3: Namespace behavior fully test-backed (3 complete)
- M4: Operator UX hardened (5 + 6 complete)
- M5: Policy parity complete (7 complete)
