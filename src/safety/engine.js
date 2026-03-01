import { config } from '../core/config.js';

const DANGEROUS_TYPES = new Set([
  'run',
  'shell',
  'file.write',
  'session.abort',
  'abort',
]);

export class SafetyEngine {
  evaluate(intent) {
    if (!intent || typeof intent !== 'object') {
      return { allowed: false, reason: 'Invalid command intent' };
    }

    if (intent.type === 'shell' || intent.type === 'run') {
      const command = intent.command || '';
      const blocked = this.matchesDeniedCommand(command);
      if (blocked) {
        return {
          allowed: false,
          reason: `Blocked command pattern matched: ${blocked}`,
        };
      }
    }

    return {
      allowed: true,
      requiresConfirmation: DANGEROUS_TYPES.has(intent.type),
      reason: null,
    };
  }

  matchesDeniedCommand(command) {
    const denyList = config.get('commands.dangerousDenyList') || [];

    for (const pattern of denyList) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(command)) {
          return pattern;
        }
      } catch {
        if (command.toLowerCase().includes(String(pattern).toLowerCase())) {
          return pattern;
        }
      }
    }

    return null;
  }
}
