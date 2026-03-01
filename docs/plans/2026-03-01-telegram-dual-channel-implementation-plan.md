# Implementation Plan: Telegram + WhatsApp Dual-Channel Remote

Created: 2026-03-01
Status: In Progress

## Purpose

Problem statement:

- The app currently relies on WhatsApp transport only.
- Telegram offers a stronger control UI (commands, inline keyboards, callbacks).
- We need dual-channel parity while focusing UX quality on Telegram.

Success criteria:

- Telegram transport is operational via Bot API.
- Core command behavior remains parity across WhatsApp and Telegram.
- Telegram supports hybrid UX (plain text + slash commands + button callbacks).
- Retry and dead-letter behavior works for Telegram inbound updates.

Scope:

- In scope: transport integration, identity mapping, parity routing, Telegram UI controls, retry/dead-letter, tests, docs updates.
- Out of scope: MTProto client API, full rich media workflows, multi-instance distributed locking.

## Work Breakdown Structure

### Phase 1: Foundations

- 1.1 Add Telegram configuration surface in `config`.
- 1.2 Create Telegram transport with polling + optional webhook.
- 1.3 Integrate transport startup/shutdown into app lifecycle.

### Phase 2: Identity and Command Parity

- 2.1 Add Telegram identity fields to SQLite model.
- 2.2 Add access mapping from Telegram user ID to canonical phone identity.
- 2.3 Extend admin commands for Telegram binding management.
- 2.4 Normalize Telegram input to shared command pipeline.

### Phase 3: UX, Reliability, and Validation

- 3.1 Add Telegram inline keyboard callbacks for high-frequency actions.
- 3.2 Implement inbound retry/dead-letter for Telegram updates.
- 3.3 Add tests for migration, parsing, and binding behavior.
- 3.4 Run full verify suite and update docs.

## RAID Log

### Risks

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Telegram webhook misconfiguration in prod | Medium | Medium | Keep polling mode available; validate config at startup |
| R2 | Identity binding mistakes lock out legitimate users | Medium | High | Owner-only binding commands + clear error messaging |
| R3 | Callback payload abuse | Medium | Medium | Strict callback pattern validation and routing |

### Assumptions

| ID | Assumption | Confidence | Validation |
|---|---|---|---|
| A1 | Bot API is sufficient for V1 feature goals | High | End-to-end command and callback tests |
| A2 | Phone remains canonical identity | High | Access checks and binding workflows |

### Dependencies

| ID | Dependency | Type | Status |
|---|---|---|---|
| D1 | Valid Telegram bot token | External | Required |
| D2 | OpenCode server availability | External | Required |

## Pre-Mortem

Potential failure modes:

- Technical: webhook and polling collide, causing duplicate updates.
- Process: transport behavior drifts from command parity.
- Security: unbound Telegram users gain access through parser bugs.

Early warning signals:

- Rising dead-letter counts for Telegram channel.
- Mismatch between Telegram and WhatsApp command outcomes.
- Access denied spikes after rollout.

## Timeline and Milestones

- M1: Telegram transport integrated and app boots with dual-channel support.
- M2: Identity binding commands and access control parity complete.
- M3: Verification suite passes and docs include Telegram operations.

## Definition of Done

- [ ] Telegram Bot API transport starts/stops cleanly.
- [ ] Hybrid command handling works on Telegram.
- [ ] Owner can bind/unbind/list Telegram identities.
- [ ] Retry/dead-letter pipeline captures Telegram failures.
- [ ] `npm run verify` passes.
- [ ] README and operations docs reflect dual-channel runtime.
