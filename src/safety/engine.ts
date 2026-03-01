import { config } from '../core/config.js';

const DANGEROUS_TYPES = new Set([
  'run',
  'shell',
  'file.write',
  'session.abort',
  'abort',
]);

export class SafetyEngine {
  evaluate(intent: { type?: string; command?: string } | null | undefined) {
    if (!intent || typeof intent !== 'object') {
      return { allowed: false, reason: 'Invalid command intent' };
    }

    if (intent.type === 'shell' || intent.type === 'run') {
      const command = intent.command || '';
      const commandSafety = this.evaluateCommandSyntax(command);
      if (!commandSafety.allowed) {
        return commandSafety;
      }

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
      requiresConfirmation: DANGEROUS_TYPES.has(intent.type || ''),
      reason: null,
    };
  }

  evaluateCommandSyntax(command: string) {
    const text = String(command || '').trim();
    if (!text) {
      return { allowed: false, reason: 'Command is empty' };
    }

    if (text.length > 500) {
      return { allowed: false, reason: 'Command exceeds maximum length' };
    }

    if (/\r|\n/.test(text)) {
      return { allowed: false, reason: 'Multiline commands are not allowed' };
    }

    const forbidden = [
      { pattern: /;/, reason: 'Command chaining with ; is not allowed' },
      { pattern: /&&|\|\|/, reason: 'Logical command chaining is not allowed' },
      { pattern: /\|/, reason: 'Pipes are not allowed' },
      { pattern: /`/, reason: 'Backtick execution is not allowed' },
      { pattern: /\$\(/, reason: 'Subshell execution is not allowed' },
      { pattern: />|</, reason: 'Redirection is not allowed' },
    ];

    for (const rule of forbidden) {
      if (rule.pattern.test(text)) {
        return { allowed: false, reason: rule.reason };
      }
    }

    return { allowed: true, reason: null };
  }

  matchesDeniedCommand(command: string): string | null {
    const denyList = (config.get('commands.dangerousDenyList') as string[] | undefined) || [];

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
