# Release Notes - v1.2.4

Release date: 2026-03-05

## Summary

v1.2.4 finalizes Telegram media support with local Transformers.js ASR, attachment-aware prompting, and JavaScript-only runtime packaging.

## Highlights

- Telegram media pipeline:
  - voice/audio notes are downloaded and transcribed locally
  - photo/document images are downloaded and attached to prompt calls
- Local ASR integration:
  - `src/media/asr.ts`
  - default model: `Xenova/whisper-small`
  - runs directly in Node via `@xenova/transformers`
- Runtime packaging:
  - Docker image no longer installs Python ASR stacks
  - No host-side Python ASR setup required
- Command UX cleanup:
  - `/get` defaults to most recent run when ID is omitted
  - `/last` and `/latest` aliases
  - help/menu removed direct `/run` and `/shell` entries

## Upgrade Notes

1. Pull latest and install dependencies:

```bash
npm install
```

2. Rebuild runtime image:

```bash
npm run docker:redeploy
```

3. Verify health:

```bash
npm run verify
npm run cli -- status
```

## References

- `CHANGELOG.md`
- `README.md`
- `docs/ONBOARDING.md`
- `docs/OPERATIONS.md`
