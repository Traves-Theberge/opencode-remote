# Implementation Plan: Monorepo + CLI + TUI Management Platform

Created: 2026-03-01
Status: In Progress
Owner: Traves + OpenCode Agent

## Phase 1 (Facilitator): Design Direction

### Problem Statement

The project now has a solid TypeScript daemon but still behaves like a single-service repo. You want:

- monorepo structure for scaling product surfaces
- a first-class CLI for onboarding, setup, and maintenance
- a visual TUI for onboarding and operations management
- a bridge layer for logs and database management

### Approaches Considered

1. Incremental monorepo (recommended)
   - Keep daemon where it is for stability, add workspace apps/packages around it.
   - Pros: lowest migration risk, faster delivery, easier rollback.
   - Cons: temporary mixed topology until daemon is moved to `apps/daemon`.

2. Full relocation in one step
   - Move daemon into workspace app immediately, wire all imports/scripts at once.
   - Pros: cleaner end state now.
   - Cons: high breakage risk and slower delivery.

3. Split repos by surface
   - Separate daemon, CLI, and TUI repos.
   - Pros: independent release cycles.
   - Cons: overhead and weaker local DX.

Chosen approach: Incremental monorepo.

## Phase 2 (Strategist): Execution Plan

## Purpose

Build an operator-grade platform around the daemon with guided onboarding and operational tooling while preserving reliability.

## Scope

In scope:

- npm workspace monorepo baseline
- `apps/cli` for onboarding/setup/maintenance
- `apps/tui` using OpenTUI for visual workflows
- `packages/bridge` for operational primitives (logs, DB, health)
- docs and runbooks for the new operational flow

Out of scope:

- remote web dashboard
- multi-tenant auth and RBAC beyond existing owner/allowlist
- distributed orchestration across many hosts

## Work Breakdown Structure (WBS)

### 1. Monorepo Foundation

- 1.1 Enable root workspaces in `package.json`.
- 1.2 Add workspace-level scripts (`dev`, `build`, `typecheck`, `test`, `lint`) strategy.
- 1.3 Keep daemon runtime stable during migration.

### 2. Shared Bridge Layer (`packages/bridge`)

- 2.1 Add bridge API for DB paths and config resolution.
- 2.2 Add audit/dead-letter/runs read APIs.
- 2.3 Add maintenance APIs (`vacuum`, prune helpers, integrity checks).
- 2.4 Add typed result models and error mapping.

### 3. CLI Application (`apps/cli`)

- 3.1 Implement setup wizard flow (owner number, Telegram mode, token prompts).
- 3.2 Implement non-interactive setup command flags.
- 3.3 Implement operations commands:
  - `status`
  - `logs`
  - `db info`
  - `db vacuum`
  - `db prune`
- 3.4 Implement service helper commands (`start`, `stop` docs-first wrappers).

### 4. TUI Application (`apps/tui`)

- 4.1 Bootstrap OpenTUI app shell and navigation.
- 4.2 Onboarding view (wizard steps + validation).
- 4.3 Operations dashboard view:
  - health/status
  - recent audit events
  - dead-letter table
  - db maintenance actions
- 4.4 Add bridge-backed actions and status feedback.

### 5. Documentation and Operator Flow

- 5.1 Update README with monorepo topology and app entry points.
- 5.2 Add `docs/ONBOARDING.md` with CLI and TUI flows.
- 5.3 Update `docs/OPERATIONS.md` with bridge/maintenance commands.

### 6. Verification

- 6.1 Root daemon verification remains green.
- 6.2 CLI typecheck/tests and smoke run.
- 6.3 TUI startup smoke run under Bun.

## RAID Log

### Risks

| ID | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | OpenTUI runtime constraints (Bun-first) conflict with Node workflows | Medium | High | Isolate TUI app with Bun-specific scripts and docs | Agent |
| R2 | Workspace migration disrupts daemon scripts | Medium | High | Keep daemon start path stable and verify after each step | Agent |
| R3 | Operational commands could mutate DB unsafely | Medium | High | Separate read-only and mutating commands; confirmations for destructive ops | Agent |

### Assumptions

| ID | Assumption | Confidence | Validation | If invalid |
|---|---|---|---|---|
| A1 | Bun is available in target ops environment for TUI | Medium | `bun --version` and TUI smoke run | Provide fallback docs for CLI-only mode |
| A2 | SQLite remains local single-writer for control-plane operations | High | Existing architecture/tests | Revisit for networked deployments |

### Issues

| ID | Issue | Status | Action |
|---|---|---|---|
| I1 | Current repo lacks dedicated onboarding UX | Open | Add CLI wizard and TUI onboarding flow |
| I2 | Maintenance commands are manual/SQL-heavy | Open | Add bridge-backed CLI/TUI actions |

### Dependencies

| ID | Dependency | Type | Status |
|---|---|---|---|
| D1 | OpenTUI (`@opentui/core`) | External | Required |
| D2 | Bun runtime for TUI | External | Available |
| D3 | Existing daemon DB schema | Internal | Available |

## Pre-Mortem

Scenario: One week after rollout, onboarding is confusing and operators avoid the TUI.

Failure modes:

- Technical: TUI runs only in some environments and crashes on startup.
- Process: onboarding path duplicated between CLI and TUI with inconsistent behavior.
- Product: maintenance actions are unclear and risky.

Preventive controls:

- single bridge API for both CLI and TUI
- one canonical onboarding sequence used in both surfaces
- explicit confirmations and dry-run previews for mutating DB actions

Early warning signals:

- repeated setup support requests
- high dead-letter counts without operator remediation
- operators using ad-hoc SQL instead of CLI/TUI flows

## Milestones

| Milestone | Target | Exit Criteria |
|---|---|---|
| M1 Monorepo baseline | Day 1 | workspaces configured, daemon still runs |
| M2 Bridge + CLI | Day 2 | onboarding + db/log commands working |
| M3 TUI MVP | Day 3 | onboarding + operations dashboard working |
| M4 Docs + hardening | Day 3 | updated docs, verify green |

## Success Criteria

| Key Result | Target |
|---|---|
| KR1 | New user can complete setup in <= 5 minutes via CLI or TUI |
| KR2 | Operator can inspect audit/dead letters and run vacuum from CLI and TUI |
| KR3 | Existing daemon verification remains green after monorepo changes |

## Task List (Execution Checklist)

- [ ] Add workspace scaffolding (`apps/*`, `packages/*`) and root script updates.
- [ ] Implement `packages/bridge` with typed DB/log/config operations.
- [ ] Implement `apps/cli` with onboarding wizard and maintenance commands.
- [ ] Implement `apps/tui` OpenTUI shell with onboarding + operations views.
- [ ] Update docs: README + `docs/ONBOARDING.md` + `docs/OPERATIONS.md`.
- [ ] Add tests for bridge and CLI command behavior.
- [ ] Run full verification and capture known limitations.

## ADR Extraction (Decision Log)

1. Decision: adopt incremental monorepo migration over full one-shot relocation.
   - Rationale: reduces outage risk and keeps daemon stable while new surfaces are added.
   - Alternatives: one-shot full relocation; split repos.
   - Confidence: high.

2. Decision: use OpenTUI for visual operations despite Bun-first runtime.
   - Rationale: explicit user requirement and feature fit for onboarding/management UX.
   - Alternatives: Node-only TUI frameworks.
   - Confidence: medium (runtime compatibility risk acknowledged).

## Phase 3 (Auditor): Critical Review Snapshot

Assessment: Approve with changes.

Major gaps to monitor during implementation:

- Keep onboarding behavior identical between CLI and TUI (single flow model).
- Guard all mutating maintenance actions with confirmation and logs.
- Preserve daemon runtime path until workspace migration fully validated.
