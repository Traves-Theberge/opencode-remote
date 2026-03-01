# Implementation Plan: Control-Plane Parity and Operations UX (Phase 2)

Created: 2026-03-01
Status: Draft
Owner: Traves + OpenCode Agent

## Purpose

### Problem Statement

The current remote command language is a transport-friendly DSL over the OpenCode SDK, but parity is incomplete for advanced OpenCode capabilities. Core execution/session flows work, while deterministic controls for models, tools, MCP, and skills are missing or only indirectly reachable through prompt text.

This creates three issues:

1. Operational ambiguity: users cannot reliably tell what is deterministic command behavior vs prompt interpretation.
2. Capability gaps: many OpenCode management actions have no first-class command path.
3. Inconsistent control UX across Telegram/WhatsApp, CLI, and TUI.

### Success Criteria

- Add explicit deterministic command namespaces for advanced OpenCode controls.
- Keep backward compatibility with existing `@oc` command behavior.
- Ensure parity surfaces (chat, CLI, TUI) use one shared task/control model.
- Add observability for message flow, transitions, and command outcomes.

### Scope

In scope:

- Command namespace expansion: `model`, `tools`, `mcp`, `skills`, and `opencode` diagnostics.
- Adapter extensions for explicit SDK-backed actions.
- Shared task/control model for CLI and TUI via bridge package.
- Interactive TUI onboarding/maintenance/task execution and flow visualizer enhancements.
- Test expansion and docs refresh.

Out of scope:

- Multi-host orchestration or cloud dashboard.
- Full RBAC redesign beyond current owner/allowlist model.
- Protocol-level redesign of OpenCode SDK.

## Logistics and Architecture

### Current Reality (Validated)

- Router maps chat DSL to internal intents.
- Executor translates intents to adapter calls.
- Adapter is SDK boundary.
- CLI/TUI now exist, with bridge package introduced.

### Target Architecture

1. Canonical command model in router with namespaced intents:
   - `model.*`
   - `tools.*`
   - `mcp.*`
   - `skills.*`
   - `opencode.*`
2. Executor remains orchestrator; adapter remains SDK façade.
3. Bridge exposes shared task catalog and task execution contracts for CLI + TUI.
4. TUI becomes interactive operator cockpit:
   - onboarding wizard
   - task runner
   - flow/timeline/transition views
   - maintenance actions

## Work Breakdown Structure (WBS)

### Phase 2.1: Control-Plane Namespace Design

- 2.1.1 Define command grammar and aliases for new namespaces.
- 2.1.2 Map each command to intent + safety tier.
- 2.1.3 Document deterministic vs prompt-driven boundary.

### Phase 2.2: Router + Executor Extensions

- 2.2.1 Add parser support for `model/tools/mcp/skills/opencode` commands.
- 2.2.2 Add executor handlers for each new intent family.
- 2.2.3 Wire owner-only restrictions where required.

### Phase 2.3: Adapter (SDK Boundary) Extensions

- 2.3.1 Add typed adapter methods for model status/set operations.
- 2.3.2 Add tool listing and capability inspection.
- 2.3.3 Add MCP listing/status actions.
- 2.3.4 Add skills listing/status actions.
- 2.3.5 Add opencode diagnostics (`/opencode status`, `/opencode ping`, etc.).

### Phase 2.4: Unified Task/Workflow Model

- 2.4.1 Finalize bridge task catalog and typed task contracts.
- 2.4.2 Refactor CLI to consume only bridge task execution (no local duplicated logic).
- 2.4.3 Refactor TUI actions to consume same bridge task contracts.

### Phase 2.5: TUI Expansion (Interactive)

- 2.5.1 Add onboarding form flow in-TUI (owner/token/mode/webhook).
- 2.5.2 Add keyboard-driven task execution panel.
- 2.5.3 Add command outcome panel (success/failure/state).
- 2.5.4 Add flow visualizer enhancements:
  - stage histogram
  - transition matrix (top transitions)
  - recent timeline with summaries

### Phase 2.6: Hardening, Tests, and Docs

- 2.6.1 Add parser tests for all new namespaces.
- 2.6.2 Add executor/adapter tests for deterministic mapping.
- 2.6.3 Add bridge task contract tests.
- 2.6.4 Add TUI smoke interaction tests (render + key events where feasible).
- 2.6.5 Update README/changelog/all docs for final operator UX.

## Assumptions

| ID | Assumption | Confidence | Validation | If invalid |
|---|---|---|---|---|
| A1 | OpenCode SDK exposes sufficient hooks for model/tool/MCP/skills introspection/control | Medium | Adapter spike + command probes | Mark command subset as read-only and document gaps |
| A2 | OpenTUI remains viable for interactive operator cockpit in target env | Medium | Bun runtime smoke + keyboard flow tests | Keep CLI as primary fallback |
| A3 | Existing safety model can be extended by tiering new namespaces | High | policy tests + denial flow tests | Add namespace-specific policy layer |

## RAID Log

### Risks

| ID | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Namespace-to-SDK mismatch causes brittle command mapping | Medium | High | Keep adapter thin and explicit with compatibility wrappers | Agent |
| R2 | TUI complexity outpaces maintainability | Medium | Medium | Reuse bridge task model, avoid TUI-only logic branches | Agent |
| R3 | Unsafe mutating commands exposed remotely | Medium | High | owner-only guards + dangerous tier confirmations + audit | Agent |

### Issues

| ID | Issue | Status | Action |
|---|---|---|---|
| I1 | Advanced OpenCode capabilities not first-class in remote command model | Open | Add namespaces and explicit intents |
| I2 | CLI and TUI logic diverge without shared contract | In Progress | enforce bridge task contract |

### Dependencies

| ID | Dependency | Type | Status |
|---|---|---|---|
| D1 | OpenCode SDK capability endpoints | External | To validate per namespace |
| D2 | OpenTUI APIs and Bun runtime stability | External | Available |
| D3 | Existing SQLite schema and audit trails | Internal | Available |

## Pre-Mortem

Failure scenario (30 days): command surface expanded but operators still avoid deterministic controls due to confusion and inconsistent behavior.

Likely failure modes:

- Technical: commands mapped to SDK endpoints inconsistently across namespaces.
- UX: TUI presents too much information without guided workflows.
- Process: docs lag implementation and create incorrect operator expectations.

Preventive controls:

- per-namespace acceptance tests with deterministic expected output.
- single bridge task contract consumed by CLI and TUI.
- docs updated in same PR as behavior changes.

Early warning signals:

- frequent fallback to free-text prompt for management actions.
- repeated support questions on “how to set model/tool/MCP/skills”.
- increase in blocked/failed command ratio after rollout.

## Timeline and Milestones

| Milestone | Target | Exit Criteria |
|---|---|---|
| M1 Namespace foundation | Day 1 | model/tools/mcp/skills/opencode grammar + routing merged |
| M2 SDK parity slice | Day 2 | adapter+executor support for selected commands |
| M3 Unified task model | Day 2 | CLI and TUI consume same bridge tasks |
| M4 TUI interactive ops | Day 3 | onboarding + task execution + flow insights stable |
| M5 Quality + docs | Day 3 | tests green, docs/changelog complete |

## Success Metrics

| Metric | Target |
|---|---|
| Deterministic command coverage for targeted namespaces | >= 90% of planned command set |
| CLI/TUI behavior parity for shared tasks | 100% |
| Regression on existing command suite | 0 failures |
| Operator setup completion time (fresh host) | <= 5 minutes with wizard |

## Task List (Execution Checklist)

- [ ] Add namespace grammar + intent map for `model/tools/mcp/skills/opencode`.
- [ ] Implement adapter methods and executor handlers for namespace commands.
- [ ] Add owner/safety tier policies and confirmation flows for mutating actions.
- [ ] Finalize bridge task contracts and remove CLI/TUI task duplication.
- [ ] Upgrade TUI to full interactive onboarding + task run workflows.
- [ ] Expand tests: router, executor, adapter, bridge, and TUI smoke.
- [ ] Run full verification and document known SDK capability gaps.
- [ ] Update README, docs, operations guide, and changelog comprehensively.

## ADR Decision Log

1. Decision: keep chat command DSL as stable control-plane language while mapping to SDK through adapter.
   - Rationale: transport usability + backward compatibility.
   - Alternatives: expose raw SDK command shape directly.
   - Confidence: high.

2. Decision: unify CLI and TUI behavior through shared bridge task contracts.
   - Rationale: prevents behavioral drift and duplicated maintenance logic.
   - Alternatives: independent implementations per surface.
   - Confidence: high.

3. Decision: stage implementation by namespaces with tests before broad rollout.
   - Rationale: reduces integration risk and keeps failures localized.
   - Alternatives: large single-cut release.
   - Confidence: high.
