import path from 'node:path';
import { spawn } from 'node:child_process';
import { env, pipeline } from '@xenova/transformers';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';

interface AsrResult {
  text: string;
  raw: unknown;
}

type AsrPipe = Awaited<ReturnType<typeof pipeline>>;
const DEFAULT_ASR_MODEL = 'Xenova/whisper-small';
const ASR_SAMPLE_RATE = 16_000;

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

    const configuredModel = String(config.get('asr.model') || DEFAULT_ASR_MODEL);
    const model = this.normalizeModel(configuredModel);
    const timeoutMs = Math.max(10_000, Number(config.get('asr.timeoutMs')) || 180_000);
    const audio = await this.decodeAudioFile(filePath);
    let asr: AsrPipe;
    try {
      asr = await this.getPipeline(model);
    } catch (error) {
      if (model !== DEFAULT_ASR_MODEL) {
        logger.warn({ model, fallbackModel: DEFAULT_ASR_MODEL, err: error }, 'ASR model init failed; falling back');
        asr = await this.getPipeline(DEFAULT_ASR_MODEL);
      } else {
        throw error;
      }
    }

    const asrAny = asr as unknown as (input: unknown, options?: unknown) => Promise<unknown>;
    const transcribeTask = asrAny(audio, {
      sampling_rate: ASR_SAMPLE_RATE,
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
    const normalizedModel = this.normalizeModel(model);
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

  normalizeModel(model: string): string {
    const raw = String(model || '').trim();
    if (!raw) {
      return DEFAULT_ASR_MODEL;
    }

    if (/^openai\/whisper/i.test(raw)) {
      return raw.replace(/^openai\//i, 'Xenova/');
    }

    if (/^whisper/i.test(raw) && !raw.includes('/')) {
      return `Xenova/${raw}`;
    }

    return raw;
  }

  /**
   * Decode compressed audio into mono Float32 PCM for Transformers.js in Node.
   */
  async decodeAudioFile(filePath: string): Promise<Float32Array> {
    return new Promise<Float32Array>((resolve, reject) => {
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          filePath,
          '-f',
          'f32le',
          '-ac',
          '1',
          '-ar',
          String(ASR_SAMPLE_RATE),
          'pipe:1',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      ffmpeg.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
          reject(new Error(`ffmpeg decode failed (${code}): ${stderr || 'unknown error'}`));
          return;
        }

        const pcmBuffer = Buffer.concat(stdoutChunks);
        if (pcmBuffer.byteLength < 4) {
          reject(new Error('Decoded audio is empty'));
          return;
        }

        const samples = new Float32Array(
          pcmBuffer.buffer,
          pcmBuffer.byteOffset,
          Math.floor(pcmBuffer.byteLength / 4),
        );
        resolve(new Float32Array(samples));
      });
    });
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
