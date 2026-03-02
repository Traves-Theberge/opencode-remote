#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { OpsBridge } from '@opencode-remote/bridge';

const bridge = new OpsBridge();

/** CLI entrypoint for setup and operational maintenance commands. */
async function main(): Promise<void> {
  const [command = 'help', ...args] = process.argv.slice(2);

  switch (command) {
    case 'setup':
      await runSetupWizard(args);
      return;
    case 'status':
      runStatus();
      return;
    case 'logs':
      runLogs(args);
      return;
    case 'flow':
      runFlow(args);
      return;
    case 'deadletters':
      runDeadLetters(args);
      return;
    case 'db':
      runDb(args);
      return;
    case 'security':
      runSecurity(args);
      return;
    case 'help':
    default:
      printHelp();
  }
}

function runSecurity(args: string[]): void {
  const action = args[0] || 'rotate-token-check';
  if (action === 'rotate-token-check') {
    printTaskResult(bridge.executeTask({ id: 'security.rotate-token-check' }));
    return;
  }
  output.write('Usage: oc-remote security <rotate-token-check>\n');
}

/** Interactive onboarding wizard for owner + Telegram transport config. */
async function runSetupWizard(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const rl = readline.createInterface({ input, output });
  try {
    const ownerNumber = (await rl.question('Owner phone number (E.164, e.g. +15551234567): ')).trim();
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
      const modeInput = (
        await rl.question('Telegram mode (polling/webhook) [polling]: ')
      )
        .trim()
        .toLowerCase();

      telegramMode = modeInput === 'webhook' ? 'webhook' : 'polling';
      if (telegramMode === 'webhook') {
        telegramWebhookUrl = (await rl.question('Telegram webhook URL: ')).trim();
        telegramWebhookSecret = (await rl.question('Telegram webhook secret: ')).trim();
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

/** Render bridge status task output. */
function runStatus(): void {
  printTaskResult(bridge.executeTask({ id: 'status' }));
}

function runLogs(args: string[]): void {
  const limit = parseInt(args[0] || '20', 10);
  printTaskResult(
    bridge.executeTask({
      id: 'logs',
      args: { limit: Number.isFinite(limit) ? limit : 20 },
    }),
  );
}

function runDeadLetters(args: string[]): void {
  const limit = parseInt(args[0] || '20', 10);
  printTaskResult(
    bridge.executeTask({
      id: 'deadletters',
      args: { limit: Number.isFinite(limit) ? limit : 20 },
    }),
  );
}

function runFlow(args: string[]): void {
  const limit = parseInt(args[0] || '120', 10);
  printTaskResult(
    bridge.executeTask({
      id: 'flow',
      args: { limit: Number.isFinite(limit) ? limit : 120 },
    }),
  );
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
    const days = parseInt(args[2] || '30', 10);
    if (!table || !['audit', 'runs', 'dead_letters', 'messages'].includes(table)) {
      output.write('Usage: oc-remote db prune <audit|runs|dead_letters|messages> <days>\n');
      return;
    }

    printTaskResult(
      bridge.executeTask({
        id: 'db.prune',
        args: { table, days: Number.isFinite(days) ? days : 30 },
      }),
    );
    return;
  }

  output.write('Usage: oc-remote db <info|vacuum|prune>\n');
}

/** Print command-line help text. */
function printHelp(): void {
  output.write(`
OpenCode Remote CLI

Commands:
  setup                         Run onboarding wizard
  setup --dry-run               Validate onboarding values without saving
  status                        Show runtime and db status
  logs [limit]                  Show recent audit rows
  flow [limit]                  Show message flow stages/transitions
  deadletters [limit]           Show recent dead letters
  db info                       Show db table stats
  db vacuum                     Run sqlite VACUUM
  db prune <table> <days>       Prune old rows (audit/runs/dead_letters/messages)
  security rotate-token-check   Validate token hygiene and rotation posture
`);
}

/** Render generic task result block for CLI output. */
function printTaskResult(result: { title: string; lines: string[] }): void {
  output.write(`${result.title}\n`);
  output.write(`${'-'.repeat(result.title.length)}\n`);
  for (const line of result.lines) {
    output.write(`${line}\n`);
  }
}

main().catch((error: unknown) => {
  output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
