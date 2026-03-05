# Release Notes - v1.2.4

Release date: 2026-03-05

## Summary

v1.2.4 finalizes Telegram media support with local Transformers ASR, attachment-aware prompting, and packaged prerequisites for both host installs and Docker builds.

## Highlights

- Telegram media pipeline:
  - voice/audio notes are downloaded and transcribed locally
  - photo/document images are downloaded and attached to prompt calls
- Local ASR integration:
  - `src/media/asr.ts`
  - `scripts/asr_transcribe.py`
  - default model: `openai/whisper-medium`
- Packaged prerequisites:
  - Docker image now installs Python ASR stack (`transformers`, `torch`, `sentencepiece`)
  - Host install bootstrap now runs ASR prereq installer (`scripts/install-asr-prereqs.sh`)
  - New helper command: `npm run asr:install`
- Command UX cleanup:
  - `/get` defaults to most recent run when ID is omitted
  - `/last` and `/latest` aliases
  - help/menu removed direct `/run` and `/shell` entries

## Upgrade Notes

1. Pull latest and install dependencies:

```bash
npm install
npm run asr:install
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
