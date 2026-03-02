# Implementation Plan: Telegram Message Formatting

**Created:** 2026-03-01
**Author:** opencode-remote
**Status:** Draft

---

## Purpose

**Problem Statement:** Telegram messages received from OpenCode Remote display as plain text despite using markdown-style formatting. The `parse_mode` parameter is not set in sendMessage calls, causing Telegram to render all content as plain text. Additionally, message output was optimized for WhatsApp character limits, causing text to appear squished in Telegram.

**Success Criteria:**
- Telegram messages display with proper formatting (bold, italic, code blocks, links)
- HTML entities are properly escaped to prevent rendering issues
- All message types (success, error, warning, info) use consistent formatting
- Existing WhatsApp formatting remains unaffected

**Scope:**
- In scope: Enable HTML parse_mode in Telegram transport, update formatter, escape HTML entities, remove WhatsApp formatting constraints
- Out of scope: Rich media messages, interactive messages

---

## Stakeholders

| Role | Name | Responsibility |
|------|------|----------------|
| Driver | User | Orchestrates execution |
| Approver | User | Final decision authority |
| Contributors | opencode | Implementation |

---

## Work Breakdown Structure

### Phase 1: Enable HTML Parse Mode

#### 1.1 Enable parse_mode in Telegram transport
- **1.1.1** Add `parse_mode: 'HTML'` to sendMessage API call | Est: 15 min | Owner: opencode
- **1.1.2** Increase chunk size from 3500 to 4096 (Telegram max) | Est: 10 min | Owner: opencode
- **1.1.3** Remove tight whitespace squishing for Telegram | Est: 15 min | Owner: opencode
- **1.1.4** Verify build passes | Est: 5 min | Owner: opencode

#### 1.2 Test HTML rendering
- **1.1.1** Send test message with HTML tags to verify rendering | Est: 10 min | Owner: opencode
- **1.1.2** Test edge cases (nested tags, special characters) | Est: 15 min | Owner: opencode

### Phase 2: Update Message Formatter

#### 2.1 Create Telegram-specific formatter
- **2.1.1** Create `src/presentation/telegram-formatter.ts` | Est: 1 hr | Owner: opencode
- **2.1.2** Implement HTML escape function | Est: 15 min | Owner: opencode
- **2.1.3** Implement format helpers (bold, code, codeBlock, link) | Est: 30 min | Owner: opencode

#### 2.2 Update message formatting functions
- **2.2.1** Update formatSuccess to use HTML bold | Est: 15 min | Owner: opencode
- **2.2.2** Update formatError to use HTML code block | Est: 15 min | Owner: opencode
- **2.2.3** Update formatWarning to use HTML formatting | Est: 15 min | Owner: opencode
- **2.2.4** Update formatWithRunId to use HTML | Est: 15 min | Owner: opencode
- **2.2.5** Update formatPermissionRequest to use HTML | Est: 15 min | Owner: opencode

### Phase 3: Polish and Test

#### 3.1 Update help command output
- **3.1.1** Format help output with proper HTML (headers, code, lists) | Est: 30 min | Owner: opencode

#### 3.2 Integration testing
- **3.2.1** Run full test suite | Est: 5 min | Owner: opencode
- **3.2.2** Manual testing via Telegram bot | Est: 20 min | Owner: opencode

#### 3.3 Documentation
- **3.3.1** Update docs/COMMAND_MODEL.md with formatting info | Est: 15 min | Owner: opencode
- **3.3.2** Update CHANGELOG.md | Est: 10 min | Owner: opencode

---

## RAID Log

### Risks

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|------------|-------|
| R1 | HTML injection from user content | Low | High | Always escape user-provided text | opencode |
| R2 | Code blocks break message length limits | Low | Medium | Keep chunking logic, test long output | opencode |
| R3 | Existing tests fail due to changed output | Low | Medium | Update test assertions | opencode |

### Assumptions

| ID | Assumption | Confidence | Validation Method | If Invalid |
|----|------------|------------|-------------------|------------|
| A1 | Telegram API accepts HTML parse_mode | High | Manual test after Phase 1 | Fall back to plain text |
| A2 | OpenCode output doesn't contain HTML | High | Code review | Add sanitization layer |
| A3 | Telegram supports longer messages than WhatsApp | High | Telegram allows 4096 chars vs WhatsApp 1600 | Adjust chunk size if needed |
| A4 | Better formatting improves readability enough to justify effort | Medium | Manual test | Partial implementation is still useful |

### Dependencies

| ID | Dependency | Type | Depends On | Blocks | Status |
|----|------------|------|------------|--------|--------|
| D1 | None - self-contained | - | - | - | - |

---

## Pre-Mortem Analysis

### Failure Modes

| Category | Potential Failure | Likelihood | Prevention |
|----------|-------------------|------------|------------|
| Technical | HTML not rendering in Telegram | Low | Phase 1 test verifies |
| Technical | Special characters (&, <, >) break HTML | Medium | Implement proper escaping in Phase 2 |
| Technical | Message chunks break HTML tags | Medium | Escape before chunking |
| Process | Scope creep (adding features) | Medium | Stick to WBS |
| External | Telegram API changes | Low | Use stable API version |

### Early Warning Signals

| Signal | What It Indicates | Detection Method | Response |
|--------|-------------------|------------------|----------|
| parse_mode not recognized | API version issue | Phase 1 test | Check Telegram API version |
| Tags visible in message | Escaping not working | Manual test | Verify escape function |
| Messages truncated | Chunking breaks tags | Test long messages | Escape before chunk |

---

## Timeline

### Key Milestones

| Milestone | Target Date | Criteria | Owner |
|-----------|-------------|----------|-------|
| M1: HTML parse_mode enabled | Day 1 | Messages render with basic HTML | opencode |
| M2: Formatter created | Day 2 | Helper functions working | opencode |
| M3: All messages formatted | Day 3 | Consistent formatting across types | opencode |
| M4: Tests pass | Day 3 | Full test suite passes | opencode |

### Critical Path

```
Phase 1 (Enable) → Phase 2 (Formatter) → Phase 3 (Polish)
    ↓                  ↓                    ↓
   [M1]              [M2]                 [M3-M4]
```

---

## Success Criteria

### Objective: Beautiful Telegram messages

| Key Result | Target | Measurement | Owner |
|------------|--------|-------------|-------|
| KR1: HTML parse_mode enabled | Day 1 | sendMessage includes parse_mode: 'HTML' | opencode |
| KR2: Formatter helpers created | Day 2 | bold(), code(), codeBlock() working | opencode |
| KR3: All message types formatted | Day 3 | Success/error/warning use HTML | opencode |
| KR4: Tests pass | Day 3 | npm test passes | opencode |

### Definition of Done

- [ ] Telegram messages render with bold, italic, code formatting
- [ ] HTML special characters (&, <, >) properly escaped
- [ ] All existing functionality works (WhatsApp, commands)
- [ ] Tests pass
- [ ] Documentation updated

---

## Decisions Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-03-01 | Use HTML over MarkdownV2 | Simpler escaping, more forgiving | MarkdownV2 requires extensive escaping |
| 2026-03-01 | Create separate Telegram formatter | Keeps existing formatter clean, allows WhatsApp flexibility | Extend existing formatter |

---

## HTML Formatting Reference

### Tags to Use

| Tag | Use Case | Example |
|-----|----------|---------|
| `<b>` | Bold - headers, titles | `<b>Status:</b> OK` |
| `<i>` | Italic - descriptions | `<i>Running tests...</i>` |
| `<code>` | Inline code - paths, commands | `<code>/status</code>` |
| `<pre>` | Code blocks - multi-line output | `<pre>output here</pre>` |
| `<a>` | Links | `<a href="url">text</a>` |
| `<blockquote>` | Quotes, notices | `<blockquote>Note: ...</blockquote>` |

### Escaping Rules

| Character | Escape To |
|-----------|-----------|
| `<` | `&lt;` |
| `>` | `&gt;` |
| `&` | `&amp;` |
| `"` | `&quot;` (in attributes) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-01 | opencode | Initial plan |
