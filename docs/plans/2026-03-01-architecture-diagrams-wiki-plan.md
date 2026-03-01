# Implementation Plan: End-to-End Architecture Diagrams + Wiki Documentation

Created: 2026-03-01
Status: Complete
Owner: Traves + OpenCode Agent

## Purpose

Create a complete, maintainable architecture visualization and documentation system for the full application (daemon, transports, control-plane, CLI, TUI, bridge, storage, and operations) with explicit state flows and a wiki-style doc structure.

## Objectives

- Provide complete end-to-end architecture coverage from user input to SDK execution and response delivery.
- Document all critical runtime state machines and lifecycle transitions.
- Establish wiki docs as the canonical operational and architectural reference.
- Make diagrams easy to update and consistent with code changes.

## Scope

In scope:

- Architecture diagrams (context, containers, components, interactions, deployment)
- State flow diagrams (message, session, confirmation, permissions, retries/dead-letter)
- Data flow and persistence maps (SQLite tables and event/audit relationships)
- Wiki docs structure, templates, and linking conventions

Out of scope:

- Auto-generated design docs from CI (future enhancement)
- External cloud architecture not used by current local-first runtime

## Diagram Strategy

### Diagram format and storage

- Primary format: Mermaid in Markdown (portable, GitHub-renderable).
- Source of truth location: `docs/architecture/`.
- Naming convention: `NN-topic.md` where `NN` is logical order (e.g., `01-system-context.md`).

### Required diagram set (v1)

1. System Context Diagram
2. Container Diagram (daemon, CLI, TUI, bridge, storage, OpenCode SDK/server, transports)
3. Component Diagram (router, executor, adapter, access, safety, formatter, store)
4. Sequence Diagram: WhatsApp inbound command path
5. Sequence Diagram: Telegram callback path
6. Sequence Diagram: dangerous command confirmation flow
7. Sequence Diagram: permission.updated event fan-out
8. State Diagram: message lifecycle (incoming -> parsed -> blocked/executed/responded)
9. State Diagram: session lifecycle (created, active, busy, locked, stale-evicted)
10. State Diagram: confirmation lifecycle (created, validated, used, expired)
11. State Diagram: transport failure/retry/dead-letter lifecycle
12. Data Flow + Persistence Diagram (tables and key relationships)
13. Deployment/Runtime Diagram (local host processes + webhook/polling modes)

## Wiki Documentation Strategy

### Proposed wiki information architecture

- `docs/wiki/Home.md`
- `docs/wiki/Architecture/`
  - `System-Overview.md`
  - `Request-Lifecycle.md`
  - `Control-Plane-Namespaces.md`
  - `State-Machines.md`
  - `Data-Model-and-Persistence.md`
- `docs/wiki/Operations/`
  - `Runbook.md`
  - `Onboarding-and-Setup.md`
  - `Troubleshooting.md`
  - `Retention-and-Maintenance.md`
- `docs/wiki/Integrations/`
  - `Telegram.md`
  - `WhatsApp.md`
  - `OpenCode-SDK-Boundary.md`
- `docs/wiki/Security/`
  - `Access-Control-and-Policy.md`
  - `Safety-Engine-and-Confirmations.md`
- `docs/wiki/Development/`
  - `Monorepo-Structure.md`
  - `Testing-Strategy.md`
  - `Quality-Gates.md`

### Wiki page template standard

Every wiki page should include:

- Purpose
- Source files
- Diagram(s)
- Key invariants
- Failure modes
- Operational checks
- Related pages

## Work Breakdown Structure (WBS)

### Phase 1: Architecture inventory and traceability

- 1.1 Inventory current architecture surfaces and runtime paths.
- 1.2 Map each diagram to source files and runtime concerns.
- 1.3 Define diagram conventions and review checklist.

### Phase 2: Diagram creation

- 2.1 Build system/context/container/component diagrams.
- 2.2 Build interaction sequence diagrams.
- 2.3 Build lifecycle state diagrams.
- 2.4 Build data and deployment diagrams.

### Phase 3: Wiki assembly

- 3.1 Create wiki directory and home/index pages.
- 3.2 Author architecture pages with embedded diagrams.
- 3.3 Author operations/security/development pages.
- 3.4 Add cross-links and consistency pass.

### Phase 4: Validation and maintenance model

- 4.1 Verify diagrams against implementation files.
- 4.2 Add documentation update checklist to PR workflow.
- 4.3 Add changelog entry for architecture/wiki publication.

## Acceptance Criteria

- All required diagrams are present and render correctly in Markdown.
- Every diagram references relevant code paths.
- Wiki home page links to all architecture/operations/security/development pages.
- State machines cover all critical transitions and terminal/error states.
- Docs include explicit update rules to prevent drift.

## Risks and Mitigations

- Risk: diagram/doc drift from implementation.
  - Mitigation: include source-file references and PR checklist requirement.
- Risk: over-complex diagrams reduce usability.
  - Mitigation: layered diagrams (overview first, detail second).
- Risk: duplicated content between README/docs/wiki.
  - Mitigation: README remains quickstart; wiki is deep reference.

## Milestones

- M1: Architecture inventory + conventions complete
- M2: Full diagram set complete
- M3: Wiki structure and content complete
- M4: Validation pass + cross-linking complete

## Task Checklist

- [x] Create `docs/architecture/` diagram pages (13 required diagrams)
- [x] Create `docs/wiki/` structure and home page
- [x] Author architecture wiki pages with embedded diagrams
- [x] Author operations/security/development wiki pages
- [x] Add doc maintenance guidance and PR checklist note
- [x] Update README/docs index/changelog to point to wiki and diagrams
