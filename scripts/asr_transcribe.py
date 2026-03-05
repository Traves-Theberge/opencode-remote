#!/usr/bin/env python3
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Transformers ASR transcription")
    parser.add_argument("--input", required=True, help="Audio file path")
    parser.add_argument(
        "--model",
        default=os.environ.get("OPENCODE_REMOTE_ASR_MODEL", "openai/whisper-medium"),
    )
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(json.dumps({"error": f"input file not found: {args.input}"}))
        return 2

    try:
        from transformers import pipeline
    except Exception as exc:
        print(json.dumps({"error": f"transformers import failed: {exc}"}))
        return 3

    try:
        asr = pipeline(
            task="automatic-speech-recognition",
            model=args.model,
        )
        result = asr(args.input)
        text = ""
        if isinstance(result, dict):
            text = str(result.get("text", "")).strip()
        else:
            text = str(result).strip()
        print(json.dumps({"text": text, "model": args.model}))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"asr failed: {exc}"}))
        return 4


if __name__ == "__main__":
    sys.exit(main())
