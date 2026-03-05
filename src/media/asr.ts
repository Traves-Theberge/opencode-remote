import path from 'node:path';
import { env, pipeline } from '@xenova/transformers';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface AsrResult {
  text: string;
  raw: unknown;
}

type AsrPipe = Awaited<ReturnType<typeof pipeline>>;

export class TransformersAsr {
  static cachedModel: string | null = null;
  static pipe: Promise<AsrPipe> | null = null;

  /**
   * Transcribe a local audio file using Transformers.js ASR pipeline.
   */
  async transcribe(filePath: string): Promise<AsrResult> {
    const enabled = Boolean(config.get('asr.enabled'));
    if (!enabled) {
      throw new Error('ASR is disabled. Set asr.enabled=true to enable voice transcription.');
    }

    const model = String(config.get('asr.model') || 'Xenova/whisper-small');
    const timeoutMs = Math.max(10_000, Number(config.get('asr.timeoutMs')) || 180_000);
    const asr = await this.getPipeline(model);

    const asrAny = asr as unknown as (input: unknown, options?: unknown) => Promise<unknown>;
    const transcribeTask = asrAny(filePath, {
      chunk_length_s: 20,
      stride_length_s: 5,
      return_timestamps: false,
    });

    const result = await this.withTimeout(transcribeTask, timeoutMs);
    const text = this.extractText(result);
    return { text, raw: result };
  }

  /**
   * Lazily initialize and cache ASR pipeline per model id.
   */
  async getPipeline(model: string): Promise<AsrPipe> {
    const normalizedModel = String(model || 'Xenova/whisper-small').trim();
    const cacheDir = path.resolve(String(config.get('asr.cacheDir') || './data/models'));

    env.cacheDir = cacheDir;
    env.allowRemoteModels = true;

    if (TransformersAsr.pipe && TransformersAsr.cachedModel === normalizedModel) {
      return TransformersAsr.pipe;
    }

    TransformersAsr.cachedModel = normalizedModel;
    TransformersAsr.pipe = pipeline('automatic-speech-recognition', normalizedModel).catch((error: unknown) => {
      TransformersAsr.pipe = null;
      TransformersAsr.cachedModel = null;
      throw error;
    }) as Promise<AsrPipe>;

    logger.info({ model: normalizedModel, cacheDir }, 'Initializing Transformers.js ASR pipeline');
    return TransformersAsr.pipe;
  }

  /**
   * Normalize unknown pipeline response shape into plain transcript text.
   */
  extractText(result: unknown): string {
    if (!result) {
      return '';
    }

    if (typeof result === 'string') {
      return result.trim();
    }

    if (typeof result === 'object') {
      const value = result as { text?: unknown };
      return String(value.text || '').trim();
    }

    return String(result).trim();
  }

  /**
   * Guard long ASR calls with a hard timeout.
   */
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`ASR timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
