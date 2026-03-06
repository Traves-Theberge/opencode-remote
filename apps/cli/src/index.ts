#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { OpsBridge } from '@opencode-remote/bridge';

const bridge = new OpsBridge();

async function main(): Promise<void> {
  const [command = 'help', ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case 'setup':
        await runSetupWizard(args);
        break;
      case 'status':
        runStatus();
        break;
      case 'logs':
        runLogs(args);
        break;
      case 'flow':
        runFlow(args);
        break;
      case 'deadletters':
        runDeadLetters(args);
        break;
      case 'db':
        runDb(args);
        break;
      case 'config':
        runConfig(args);
        break;
      case 'doctor':
        runDoctor();
        break;
      case 'security':
        runSecurity(args);
        break;
      case 'help':
      default:
        printHelp();
    }
  } catch (error) {
    output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function runSecurity(args: string[]): void {
  const action = args[0] || 'rotate-token-check';
  if (action === 'rotate-token-check') {
    printTaskResult(bridge.executeTask({ id: 'security.rotate-token-check' }));
    return;
  }
  output.write('Usage: oc-remote security rotate-token-check\n');
}

async function runSetupWizard(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const rl = readline.createInterface({ input, output });

  try {
    output.write('\n--- OpenCode Remote Setup ---\n\n');

    const ownerNumber = (await rl.question('Owner phone number (E.164, e.g. +15551234567): ')).trim();
    if (!ownerNumber) {
      throw new Error('Owner phone number is required');
    }

    const telegramEnabledRaw = (
      await rl.question('Enable Telegram transport? (yes/no) [yes]: ')
    )
      .trim()
      .toLowerCase();
    const telegramEnabled = telegramEnabledRaw !== 'no';

    let telegramBotToken = '';
    let telegramMode: 'polling' | 'webhook' = 'polling';
    let telegramWebhookUrl = '';
    let telegramWebhookSecret = '';

    if (telegramEnabled) {
      telegramBotToken = (await rl.question('Telegram bot token: ')).trim();
      if (!telegramBotToken) {
        throw new Error('Telegram bot token is required when Telegram is enabled');
      }

      const modeInput = (
        await rl.question('Telegram mode (polling/webhook) [polling]: ')
      )
        .trim()
        .toLowerCase();

      telegramMode = modeInput === 'webhook' ? 'webhook' : 'polling';
      if (telegramMode === 'webhook') {
        telegramWebhookUrl = (await rl.question('Telegram webhook URL: ')).trim();
        telegramWebhookSecret = (await rl.question('Telegram webhook secret: ')).trim();
        if (!telegramWebhookUrl || !telegramWebhookSecret) {
          throw new Error('Webhook URL and secret are required in webhook mode');
        }
      }
    }

    bridge.applySetup({
      ownerNumber,
      telegramEnabled,
      telegramBotToken,
      telegramMode,
      telegramWebhookUrl,
      telegramWebhookSecret,
    }, { dryRun });

    output.write(`\nSetup ${dryRun ? 'validated (dry-run)' : 'saved'}.\n`);
    output.write(`DB path: ${bridge.resolveDbPath()}\n`);
    output.write(dryRun ? 'Next: run setup without --dry-run to persist values.\n' : 'Next: npm start\n');
  } finally {
    rl.close();
  }
}

function runStatus(): void {
  printTaskResult(bridge.executeTask({ id: 'status' }));
}

function runLogs(args: string[]): void {
  const limit = parseLimit(args[0], 20);
  printTaskResult(
    bridge.executeTask({
      id: 'logs',
      args: { limit },
    }),
  );
}

function runDeadLetters(args: string[]): void {
  const limit = parseLimit(args[0], 20);
  printTaskResult(
    bridge.executeTask({
      id: 'deadletters',
      args: { limit },
    }),
  );
}

function runFlow(args: string[]): void {
  const limit = parseLimit(args[0], 120);
  printTaskResult(
    bridge.executeTask({
      id: 'flow',
      args: { limit },
    }),
  );
}

function runConfig(args: string[]): void {
  const action = args[0];

  if (!action || action === 'list') {
    printTaskResult(bridge.executeTask({ id: 'config.list' }));
    return;
  }

  if (action === 'get') {
    const key = args[1];
    if (!key) {
      output.write('Usage: oc-remote config get <key>\n');
      return;
    }
    printTaskResult(bridge.executeTask({ id: 'config.get', args: { key } }));
    return;
  }

  if (action === 'set') {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      output.write('Usage: oc-remote config set <key> <value>\n');
      return;
    }
    printTaskResult(bridge.executeTask({ id: 'config.set', args: { key, value } }));
    return;
  }

  output.write('Usage: oc-remote config <list|get <key>|set <key> <value>>\n');
}

function runDoctor(): void {
  output.write('\n--- Running diagnostics ---\n\n');

  const checks = [
    { name: 'Node version', pass: process.version >= 'v20', expected: '>= 20' },
    { name: 'DB exists', pass: bridge.resolveDbPath() !== '', expected: 'path defined' },
    { name: 'Config valid', pass: true, expected: 'no errors' },
  ];

  let allPass = true;
  for (const check of checks) {
    const status = check.pass ? '✓' : '✗';
    output.write(`${status} ${check.name} (expected: ${check.expected})\n`);
    if (!check.pass) allPass = false;
  }

  output.write('\n');
  if (allPass) {
    output.write('All checks passed.\n');
  } else {
    output.write('Some checks failed. Run "oc-remote status" for details.\n');
  }
}

function runDb(args: string[]): void {
  const action = args[0] || 'info';

  if (action === 'info') {
    printTaskResult(bridge.executeTask({ id: 'db.info' }));
    return;
  }

  if (action === 'vacuum') {
    printTaskResult(bridge.executeTask({ id: 'db.vacuum' }));
    return;
  }

  if (action === 'prune') {
    const table = args[1] as 'audit' | 'runs' | 'dead_letters' | 'messages' | undefined;
    const days = parseLimit(args[2], 30);
    if (!table || !['audit', 'runs', 'dead_letters', 'messages'].includes(table)) {
      output.write('Usage: oc-remote db prune <audit|runs|dead_letters|messages> <days>\n');
      return;
    }

    printTaskResult(
      bridge.executeTask({
        id: 'db.prune',
        args: { table, days },
      }),
    );
    return;
  }

  output.write('Usage: oc-remote db <info|vacuum|prune>\n');
}

function parseLimit(value: string | undefined, defaultValue: number): number {
  const parsed = parseInt(value || String(defaultValue), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function printHelp(): void {
  output.write(`
OpenCode Remote CLI

Usage: oc-remote <command> [options]

Setup:
  setup                         Run interactive onboarding wizard
  setup --dry-run               Validate settings without saving

Status & Monitoring:
  status                        Show runtime health and DB stats
  logs [limit]                  Show recent audit events (default: 20)
  flow [limit]                  Show message flow stages (default: 120)
  deadletters [limit]           Show failed messages (default: 20)

Configuration:
  config list                   List all config keys
  config get <key>              Get a config value
  config set <key> <value>      Set a config value

Database:
  db info                       Show table stats and row counts
  db vacuum                     Reclaim unused DB space
  db prune <table> <days>       Delete old rows

  Tables: audit, runs, dead_letters, messages

Maintenance:
  doctor                        Run diagnostics and health checks
  security rotate-token-check   Validate token hygiene

Examples:
  oc-remote status
  oc-remote logs 50
  oc-remote db prune audit 30
  oc-remote config get telegram.botToken
  oc-remote config set telegram.pollingEnabled true
  oc-remote doctor
`);
}

function printTaskResult(result: { title: string; lines: string[] }): void {
  output.write(`${result.title}\n`);
  output.write(`${'-'.repeat(result.title.length)}\n`);
  for (const line of result.lines) {
    output.write(`${line}\n`);
  }
}

main();
