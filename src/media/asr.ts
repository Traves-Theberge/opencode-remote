import { spawn } from 'node:child_process';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface AsrResult {
  text: string;
  raw: unknown;
}

export class TransformersAsr {
  async transcribe(filePath: string): Promise<AsrResult> {
    const enabled = Boolean(config.get('asr.enabled'));
    if (!enabled) {
      throw new Error('ASR is disabled. Set asr.enabled=true to enable voice transcription.');
    }

    const scriptPath = path.resolve(process.cwd(), 'scripts/asr_transcribe.py');
    const model = String(config.get('asr.model') || 'openai/whisper-medium');
    const timeoutMs = Math.max(10_000, Number(config.get('asr.timeoutMs')) || 180_000);
    const pythonBin = String(config.get('asr.pythonBin') || 'python3');

    return new Promise<AsrResult>((resolve, reject) => {
      const child = spawn(
        pythonBin,
        [scriptPath, '--input', filePath, '--model', model],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            OPENCODE_REMOTE_ASR_MODEL: model,
          },
        },
      );

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          logger.warn({ code, stderr }, 'ASR subprocess failed');
          reject(new Error(stderr.trim() || `ASR exited with code ${code}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout || '{}') as { text?: string; [key: string]: unknown };
          resolve({
            text: String(parsed.text || '').trim(),
            raw: parsed,
          });
        } catch (error) {
          reject(
            new Error(
              `ASR output parse failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });
    });
  }
}
