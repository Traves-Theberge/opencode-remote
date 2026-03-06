# Documentation Index

- Wiki home: `docs/wiki/Home.md`
- End-to-end deepwiki guide: `docs/wiki/End-to-End-Guide.md`
- Architecture overview: `docs/ARCHITECTURE.md`
- Command routing and command families: `docs/COMMAND_MODEL.md`
- Runtime and persistence data models: `docs/DATA_MODELS.md`
- SQLite schema and migration details: `docs/DATABASE_SCHEMA.md`
- Database ERD: `docs/ERD.md`
- Onboarding guide: `docs/ONBOARDING.md`
- Operations and runbook guidance: `docs/OPERATIONS.md`
- Release history: `CHANGELOG.md`

## Documentation Maintenance Checklist (PR)

- If command behavior changes, update `docs/COMMAND_MODEL.md` and relevant wiki pages.
- If persistence/model changes, update `docs/DATABASE_SCHEMA.md`, `docs/ERD.md`, and `docs/DATA_MODELS.md`.
- If runtime flow changes, update affected wiki pages and cross-links.
- If end-to-end flow changes, update `docs/wiki/End-to-End-Guide.md` and related wiki lifecycle pages.
- If onboarding/ops behavior changes, update `README.md`, `docs/ONBOARDING.md`, and `docs/wiki/Operations/*`.
- Add a concise changelog note under `CHANGELOG.md` `[Unreleased]`.
