import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class AuditLogger {
  constructor(filePath = './data/audit.log') {
    this.filePath = filePath;
    this.lastHash = '';
  }

  async init() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
  }

  async write(event) {
    const payload = {
      ts: new Date().toISOString(),
      ...event,
    };

    const serialized = JSON.stringify(payload);
    const hash = crypto
      .createHash('sha256')
      .update(`${this.lastHash}:${serialized}`)
      .digest('hex');

    const line = JSON.stringify({
      prev: this.lastHash,
      hash,
      event: payload,
    });

    this.lastHash = hash;
    await appendFile(this.filePath, `${line}\n`, 'utf8');
  }
}
