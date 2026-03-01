import { createCliRenderer, TextRenderable, type KeyEvent } from '@opentui/core';
import { OpsBridge, type TaskDefinition, type TaskId } from '../../../packages/bridge/src/index.js';

const bridge = new OpsBridge();
const renderer = await createCliRenderer({ exitOnCtrlC: true });

const tasks = bridge.getTaskCatalog();
let selectedTask = 0;
let mode: 'dashboard' | 'onboarding' = 'dashboard';
let statusMessage = 'Ready.';
let outputLines: string[] = [];
let activePane: 'overview' | 'flow' | 'tasks' | 'output' = 'overview';
let outputPage = 0;
let timelinePage = 0;

let ownerInput = '';
let tokenInput = '';
let modeInput: 'polling' | 'webhook' = 'polling';
let webhookUrlInput = '';
let webhookSecretInput = '';
let onboardingStep = 0;

const view = new TextRenderable(renderer, {
  id: 'main-view',
  content: '',
  selectable: false,
});

renderer.root.add(view);

function bar(label: string, value: number, max: number): string {
  const width = 18;
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const safeFilled = Math.max(0, Math.min(width, filled));
  return `${label.padEnd(12)} ${'█'.repeat(safeFilled)}${'░'.repeat(width - safeFilled)} ${value}`;
}

function renderDashboard(): string {
  const cfg = bridge.getRuntimeConfig();
  const stats = bridge.getDbStats();
  const flow = bridge.getFlowInsights(140);
  const onboardingNeeded = !cfg.ownerNumber;

  const stageOrder = ['incoming', 'responded', 'executed', 'blocked', 'dead_letter', 'access_denied'];
  const maxStageCount = Math.max(1, ...stageOrder.map((stage) => Number(flow.stageCounts[stage] || 0)));
  const stageLines = stageOrder.map((stage) => bar(stage, Number(flow.stageCounts[stage] || 0), maxStageCount));
  const transitionLines = Object.entries(flow.transitions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, count]) => `${key.padEnd(26)} ${count}`);
  const timelinePageSize = 8;
  const timelineStart = timelinePage * timelinePageSize;
  const timelineWindow = flow.latest.slice(timelineStart, timelineStart + timelinePageSize);
  const timelineLines = timelineWindow.map((item) => {
    const ts = new Date(item.at).toISOString().slice(11, 19);
    const detail = item.summary ? ` ${item.summary}` : '';
    return `${ts}  ${item.stage.padEnd(12)} ${item.eventType}${detail}`;
  });

  const taskLines = tasks.map((task, index) => {
    const marker = index === selectedTask ? '>' : ' ';
    return `${marker} [${index + 1}] ${task.label}`;
  });

  const outputPageSize = 10;
  const outputStart = outputPage * outputPageSize;
  const outputPreview = outputLines.length
    ? outputLines.slice(outputStart, outputStart + outputPageSize)
    : ['(no task output yet)'];

  const panes = [
    { id: 'overview', label: 'Overview' },
    { id: 'flow', label: 'Flow' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'output', label: 'Output' },
  ] as const;

  const paneTabs = panes
    .map((pane) => (pane.id === activePane ? `[${pane.label}]` : ` ${pane.label} `))
    .join(' | ');

  const overviewPane = [
    `Owner: ${cfg.ownerNumber || '(not configured)'}`,
    `Database: ${cfg.storageDbPath}`,
    `Telegram: ${cfg.telegramEnabled ? cfg.telegramMode : 'disabled'}`,
    `Rows: users=${stats.users} runs=${stats.runs} audit=${stats.audit} dead=${stats.deadLetters}`,
    '',
    onboardingNeeded
      ? 'Onboarding required. Press o to start wizard.'
      : 'Onboarding complete. System appears configured.',
  ];

  const flowPane = [
    'Flow Visualizer',
    ...stageLines,
    '',
    'Top Transitions',
    ...(transitionLines.length ? transitionLines : ['No transitions yet.']),
    '',
    `Latest Timeline (page ${timelinePage + 1})`,
    ...(timelineLines.length ? timelineLines : ['No recent events found.']),
  ];

  const tasksPane = [
    'Task Runner (Up/Down + Enter)',
    ...taskLines,
    '',
    `Selected task: ${(tasks[selectedTask] as TaskDefinition | undefined)?.label || 'status'}`,
    `Description: ${(tasks[selectedTask] as TaskDefinition | undefined)?.description || ''}`,
  ];

  const outputPane = [
    `Task Output (page ${outputPage + 1})`,
    ...outputPreview,
  ];

  const paneContent =
    activePane === 'overview'
      ? overviewPane
      : activePane === 'flow'
        ? flowPane
        : activePane === 'tasks'
          ? tasksPane
          : outputPane;

  return [
    'OpenCode Remote Manager (Interactive Control Plane)',
    '====================================================',
    paneTabs,
    '',
    ...paneContent,
    '',
    `Status: ${statusMessage}`,
    'Keys: Left/Right pane | Up/Down task | Enter run | o onboarding | n/b timeline page | ]/[ output page | v vacuum | p prune dead_letters 30',
    'Press Ctrl+C to exit.',
  ].join('\n');
}

function renderOnboarding(): string {
  const steps = [
    `1) Owner number (E.164): ${ownerInput}`,
    `2) Telegram bot token: ${tokenInput ? '[set]' : ''}`,
    `3) Telegram mode (toggle with m): ${modeInput}`,
    `4) Webhook URL (only webhook mode): ${webhookUrlInput}`,
    `5) Webhook secret (only webhook mode): ${webhookSecretInput ? '[set]' : ''}`,
  ];

  return [
    'Onboarding Wizard (Interactive)',
    '===============================',
    'Type values, Enter to move next, Backspace to edit.',
    'Press s to save setup, Esc to cancel onboarding.',
    '',
    ...steps.map((line, index) => `${index === onboardingStep ? '>' : ' '} ${line}`),
    '',
    `Status: ${statusMessage}`,
  ].join('\n');
}

function render(): void {
  view.content = mode === 'onboarding' ? renderOnboarding() : renderDashboard();
}

function selectedTaskId(): TaskId {
  const selected = tasks[selectedTask];
  return selected ? selected.id : 'status';
}

function executeTaskById(id: TaskId, args?: Record<string, string | number | boolean | undefined>): void {
  const result = bridge.executeTask({ id, args });
  outputLines = result.lines;
  outputPage = 0;
  statusMessage = `${result.title} completed.`;
}

function appendInputChar(key: KeyEvent): void {
  const sequence = key.sequence || '';
  if (key.name === 'backspace') {
    if (onboardingStep === 0) {
      ownerInput = ownerInput.slice(0, -1);
      return;
    }
    if (onboardingStep === 1) {
      tokenInput = tokenInput.slice(0, -1);
      return;
    }
    if (onboardingStep === 3) {
      webhookUrlInput = webhookUrlInput.slice(0, -1);
      return;
    }
    if (onboardingStep === 4) {
      webhookSecretInput = webhookSecretInput.slice(0, -1);
      return;
    }
    return;
  }

  if (sequence.length !== 1 || key.ctrl || key.meta) {
    return;
  }

  if (onboardingStep === 0) {
    ownerInput += sequence;
  } else if (onboardingStep === 1) {
    tokenInput += sequence;
  } else if (onboardingStep === 3) {
    webhookUrlInput += sequence;
  } else if (onboardingStep === 4) {
    webhookSecretInput += sequence;
  }
}

function saveOnboarding(): void {
  bridge.applySetup({
    ownerNumber: ownerInput.trim(),
    telegramEnabled: Boolean(tokenInput.trim()),
    telegramBotToken: tokenInput.trim(),
    telegramMode: modeInput,
    telegramWebhookUrl: modeInput === 'webhook' ? webhookUrlInput.trim() : '',
    telegramWebhookSecret: modeInput === 'webhook' ? webhookSecretInput.trim() : '',
  });
  mode = 'dashboard';
  statusMessage = 'Onboarding saved successfully.';
}

renderer.keyInput.on('keypress', (key: KeyEvent) => {
  if (mode === 'onboarding') {
    if (key.name === 'escape') {
      mode = 'dashboard';
      statusMessage = 'Onboarding canceled.';
      render();
      return;
    }

    if (key.name === 'm') {
      modeInput = modeInput === 'polling' ? 'webhook' : 'polling';
      render();
      return;
    }

    if (key.name === 's') {
      saveOnboarding();
      render();
      return;
    }

    if (key.name === 'return') {
      onboardingStep = (onboardingStep + 1) % 5;
      render();
      return;
    }

    appendInputChar(key);
    render();
    return;
  }

  if (key.name === 'up') {
    selectedTask = (selectedTask - 1 + tasks.length) % tasks.length;
    render();
    return;
  }

  if (key.name === 'down') {
    selectedTask = (selectedTask + 1) % tasks.length;
    render();
    return;
  }

  if (key.name === 'left') {
    activePane =
      activePane === 'overview'
        ? 'output'
        : activePane === 'flow'
          ? 'overview'
          : activePane === 'tasks'
            ? 'flow'
            : 'tasks';
    render();
    return;
  }

  if (key.name === 'right') {
    activePane =
      activePane === 'overview'
        ? 'flow'
        : activePane === 'flow'
          ? 'tasks'
          : activePane === 'tasks'
            ? 'output'
            : 'overview';
    render();
    return;
  }

  if (key.name === 'return') {
    executeTaskById(selectedTaskId());
    render();
    return;
  }

  if (key.name === 'o') {
    mode = 'onboarding';
    onboardingStep = 0;
    statusMessage = 'Onboarding started.';
    render();
    return;
  }

  if (key.name === 'n') {
    timelinePage += 1;
    render();
    return;
  }

  if (key.sequence === '[') {
    outputPage = Math.max(0, outputPage - 1);
    render();
    return;
  }

  if (key.sequence === ']') {
    outputPage += 1;
    render();
    return;
  }

  if (key.name === 'b') {
    timelinePage = Math.max(0, timelinePage - 1);
    render();
    return;
  }

  if (key.name === 'v') {
    executeTaskById('db.vacuum');
    render();
    return;
  }

  if (key.name === 'p') {
    executeTaskById('db.prune', { table: 'dead_letters', days: 30 });
    render();
  }
});

render();
