# Documentation Index

- Architecture diagrams: `docs/architecture/`
- Wiki home: `docs/wiki/Home.md`
- Architecture overview: `docs/ARCHITECTURE.md`
- Command routing and command families: `docs/COMMAND_MODEL.md`
- Runtime and persistence data models: `docs/DATA_MODELS.md`
- SQLite schema and migration details: `docs/DATABASE_SCHEMA.md`
- Database ERD: `docs/ERD.md`
- Onboarding guide (CLI + TUI): `docs/ONBOARDING.md`
- Operations and runbook guidance: `docs/OPERATIONS.md`
- Security review register: `docs/SECURITY_REVIEW.md`
- Security remediation closure log: `TOFIX.md`
- Telegram dual-channel design: `docs/plans/2026-03-01-telegram-dual-channel-design.md`
- Release history: `CHANGELOG.md`
- Current release notes: `RELEASE_NOTES_v1.2.5.md`

## Documentation Maintenance Checklist (PR)

- If command behavior changes, update `docs/COMMAND_MODEL.md` and relevant wiki pages.
- If persistence/model changes, update `docs/DATABASE_SCHEMA.md`, `docs/ERD.md`, and `docs/wiki/Architecture/Data-Model-and-Persistence.md`.
- If runtime flow changes, update affected `docs/architecture/*.md` diagrams and wiki cross-links.
- If onboarding/ops behavior changes, update `README.md`, `docs/ONBOARDING.md`, and `docs/wiki/Operations/*`.
- Add a concise changelog note under `CHANGELOG.md` `[Unreleased]`.
