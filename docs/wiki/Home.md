# OpenCode Remote Wiki

## Purpose

Deep reference for architecture, operations, integrations, security, and development workflows.

## Start Here (Recommended)

- Deepwiki entrypoint: `docs/wiki/End-to-End-Guide.md`
- Quick architecture pass: `docs/ARCHITECTURE.md`
- Runtime operations pass: `docs/wiki/Operations/Runbook.md`

## Sections

- Architecture
  - `docs/ARCHITECTURE.md`
  - `docs/COMMAND_MODEL.md`
  - `docs/DATA_MODELS.md`
  - `docs/DATABASE_SCHEMA.md`
  - `docs/ERD.md`
- Operations
  - `docs/wiki/Operations/Runbook.md`
  - `docs/wiki/Operations/Onboarding-and-Setup.md`
  - `docs/wiki/Operations/Troubleshooting.md`
  - `docs/wiki/Operations/Retention-and-Maintenance.md`
- Integrations
  - `docs/wiki/Integrations/Telegram.md`
  - `docs/wiki/Integrations/OpenCode-SDK-Boundary.md`
- Security
  - `docs/wiki/Security/Access-Control-and-Policy.md`
  - `docs/wiki/Security/Safety-Engine-and-Confirmations.md`
- Development
  - `docs/wiki/Development/Monorepo-Structure.md`
  - `docs/wiki/Development/Testing-Strategy.md`
  - `docs/wiki/Development/Quality-Gates.md`

## Role-based reading paths

- Operator (day-2):
  1) `docs/wiki/End-to-End-Guide.md`
  2) `docs/wiki/Operations/Runbook.md`
  3) `docs/wiki/Operations/Troubleshooting.md`
- Contributor (feature work):
  1) `docs/wiki/End-to-End-Guide.md`
  2) `docs/ARCHITECTURE.md`
  3) `docs/wiki/Development/Testing-Strategy.md`
- Security reviewer:
  1) `docs/wiki/End-to-End-Guide.md`
  2) `docs/wiki/Security/Access-Control-and-Policy.md`
  3) `docs/wiki/Security/Safety-Engine-and-Confirmations.md`

## Key invariants

- README remains quickstart; wiki is detailed reference.
- Architecture references are maintained in `docs/ARCHITECTURE.md`.

## Operational checks

- Keep wiki links synchronized when moving docs.
- Validate examples against current scripts and command names.

## Related pages

- `docs/README.md`
- `docs/ARCHITECTURE.md`
