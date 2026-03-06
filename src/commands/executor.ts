import { MessageFormatter } from '../presentation/formatter.js';
import type { OpenCodeAdapter } from '../adapter/opencode.js';
import type { AccessController, SessionState } from '../access/controller.js';
import type { LocalStore } from '../storage/sqlite.js';

interface IntentBase {
  type: string;
  [key: string]: unknown;
}

interface RuntimeStatus {
  telegram: {
    mode: string;
    state: string;
    pollingConflictCount: number;
    pollingPausedForMs: number;
    recoveryBlockedForMs?: number;
    lastPollingConflictAt?: number;
    lastPollingRecoveryError?: string;
  };
  channels: {
    telegramEnabled: boolean;
    whatsappEnabled: boolean;
  };
  build?: {
    version: string;
    buildId: string;
  };
  lease: {
    ownerId: string | null;
    expiresInMs: number;
    ownedByCurrentInstance: boolean;
  };
}

export class CommandExecutor {
  adapter: OpenCodeAdapter;
  access: AccessController;
  store: LocalStore;
  formatter: MessageFormatter;
  getRuntimeStatus: () => RuntimeStatus;

  constructor(
    opencodeAdapter: OpenCodeAdapter,
    accessController: AccessController,
    store: LocalStore,
    getRuntimeStatus?: () => RuntimeStatus,
  ) {
    this.adapter = opencodeAdapter;
    this.access = accessController;
    this.store = store;
    this.formatter = new MessageFormatter();
    this.getRuntimeStatus =
      getRuntimeStatus ||
      (() => ({
        telegram: {
          mode: 'polling',
          state: 'unknown',
          pollingConflictCount: 0,
          pollingPausedForMs: 0,
        },
        channels: {
          telegramEnabled: false,
          whatsappEnabled: false,
        },
        lease: {
          ownerId: null,
          expiresInMs: 0,
          ownedByCurrentInstance: false,
        },
      }));
  }

  /**
   * Execute routed intent against adapter, store, and access/session state.
   */
  async execute(intent: IntentBase, session: SessionState) {
    const context = {
      sessionId: this.access.getActiveSessionId(session),
      directory: this.access.getCwd(session),
    };

    switch (intent.type) {
      case 'status': {
        const runtime = this.getRuntimeStatus();
        return [
          this.formatter.header('Status'),
          '',
          '✅ OpenCode Remote is online',
          `🧵 Active session: ${context.sessionId || '(none)'}`,
          `📂 CWD: ${context.directory || '(unset)'}`,
          `📡 Telegram: ${runtime.channels.telegramEnabled ? runtime.telegram.state : 'disabled'} (${runtime.telegram.mode})`,
          `📱 WhatsApp: ${runtime.channels.whatsappEnabled ? 'enabled' : 'disabled'}`,
          runtime.build ? `🏷️ Build: ${runtime.build.version} (${runtime.build.buildId})` : '',
          runtime.telegram.pollingConflictCount > 0
            ? `⚠️ Telegram polling conflicts: ${runtime.telegram.pollingConflictCount} (retry in ${Math.ceil(runtime.telegram.pollingPausedForMs / 1000)}s)`
            : '',
          (runtime.telegram.recoveryBlockedForMs || 0) > 0
            ? `⏳ Telegram reset cooldown: ${Math.ceil((runtime.telegram.recoveryBlockedForMs || 0) / 1000)}s`
            : '',
          runtime.telegram.lastPollingRecoveryError
            ? `🛠️ Last polling recovery error: ${runtime.telegram.lastPollingRecoveryError}`
            : '',
          '',
          'Use `/help` for control commands.',
        ]
          .filter(Boolean)
          .join('\n');
      }

      case 'prompt': {
        const files = Array.isArray(intent.files)
          ? (intent.files as Array<{ filePath: string; mimeType: string; filename?: string }>)
          : [];
        const hasVisionInput = files.some((file) => /^(image\/|application\/pdf$)/i.test(String(file.mimeType || '')));
        const result = await this.adapter.sendPrompt(String(intent.text || ''), {
          ...context,
          files,
          modelOverride: hasVisionInput
            ? {
                providerID: 'openai',
                modelID: 'gpt-5.3-codex',
              }
            : undefined,
        });
        this.access.setActiveSessionId(session, result.sessionId);
        return this.formatter.formatPromptResult(result);
      }

      case 'run': {
        const startedAt = Date.now();
        const command = String(intent.command || '');
        const result = await this.adapter.runCommand(command, context);
        return this.formatter.formatShellResult({
          command,
          output: result.output,
          durationMs: Date.now() - startedAt,
        });
      }

      case 'shell': {
        const startedAt = Date.now();
        const command = String(intent.command || '');
        const result = await this.adapter.runShell(command, context);
        return this.formatter.formatShellResult({
          command,
          output: result.output,
          durationMs: Date.now() - startedAt,
        });
      }

      case 'file.read': {
        const filePath = String(intent.path || '');
        const result = await this.adapter.readFile(filePath, context);
        return this.formatter.formatFileReadResult({
          path: filePath,
          content: result.content,
        });
      }

      case 'file.write': {
        return this.formatter.formatWarning(
          'File Write',
          'V1 does not support direct file writes yet. Use /run with an editor command.',
        );
      }

      case 'session.list': {
        const sessions = await this.adapter.listSessions(context);
        return this.formatter.formatSessionList(sessions);
      }

      case 'session.status': {
        const targetSessionId = String(intent.sessionId || '');
        const status = await this.adapter.getSessionStatus(targetSessionId || null, context);
        const target = targetSessionId || context.sessionId;
        return this.formatter.formatSessionStatus(status, target);
      }

      case 'session.use': {
        const nextSessionId = String(intent.sessionId || '');
        if (!nextSessionId) {
          return this.formatter.formatError('Session', 'Missing session ID');
        }
        this.access.setActiveSessionId(session, nextSessionId);
        this.adapter.setCurrentSessionId(nextSessionId);
        return this.formatter.formatSuccess('Session', `Active session set to ${nextSessionId}`);
      }

      case 'session.new': {
        const created = await this.adapter.createSession(
          String(intent.title || 'WhatsApp Remote Session'),
          context,
        );
        const createdId = String(created?.id || '');
        if (!createdId) {
          return this.formatter.formatError('Session', 'Failed to create session');
        }
        this.access.setActiveSessionId(session, createdId);
        this.adapter.setCurrentSessionId(createdId);
        return this.formatter.formatSuccess('Session', `Created new session ${createdId}`);
      }

      case 'session.abort': {
        const targetSessionId = String(intent.sessionId || '');
        await this.adapter.abortSession(targetSessionId, context);
        if (this.access.getActiveSessionId(session) === targetSessionId) {
          this.access.setActiveSessionId(session, null);
        }
        return this.formatter.formatSuccess('Session Abort', `Aborted session ${targetSessionId}`);
      }

      case 'diff': {
        const diff = await this.adapter.getDiff(String(intent.sessionId || '') || null, context);
        return this.formatter.formatDiffResult(diff);
      }

      case 'summarize': {
        await this.adapter.summarize(String(intent.sessionId || '') || null, context);
        return this.formatter.formatSuccess('Summarize', 'Session summarized.');
      }

      case 'path.pwd': {
        return this.formatter.formatSuccess('Path', `Current directory: ${context.directory || '(unset)'}`);
      }

      case 'path.cd': {
        const result = this.access.setCwd(session, String(intent.path || ''));
        if (!result.ok) {
          return this.formatter.formatError('Path', result.error || 'Failed to change directory');
        }
        return this.formatter.formatSuccess('Path', `Directory changed to ${result.cwd}`);
      }

      case 'file.list': {
        const targetPath = String(intent.path || '.');
        const items = await this.adapter.listFiles(targetPath, context);
        return this.formatter.formatFileList(items, targetPath);
      }

      case 'find.files': {
        if (!intent.query) {
          return this.formatter.formatError('Find Files', 'Missing query');
        }
        const query = String(intent.query || '');
        const items = await this.adapter.findFiles(query, context);
        return this.formatter.formatFindFilesResult(query, items);
      }

      case 'find.text': {
        if (!intent.pattern) {
          return this.formatter.formatError('Find Text', 'Missing pattern');
        }
        const pattern = String(intent.pattern || '');
        const matches = await this.adapter.findText(pattern, context);
        return this.formatter.formatFindTextResult(pattern, matches);
      }

      case 'project.list': {
        const projects = await this.adapter.listProjects();
        if (!Array.isArray(projects) || projects.length === 0) {
          return this.formatter.formatWarning('Projects', 'No projects found.');
        }
        const lines = projects.slice(0, 20).map((project) => {
          const normalized = project as { id?: string; path?: string; directory?: string };
          const projectPath = normalized.path || normalized.directory || '(unknown path)';
          return `• \`${normalized.id || '(unknown)'}\` · ${projectPath}`;
        });
        return [
          this.formatter.header('Projects'),
          '',
          `📦 Found ${projects.length} project(s)`,
          ...lines,
          '',
          'Use `/project use <id>` to switch path context.',
        ].join('\n');
      }

      case 'project.use': {
        if (!intent.projectId) {
          return this.formatter.formatError('Project', 'Missing project ID');
        }
        const projectId = String(intent.projectId || '');
        const project = await this.adapter.getProjectById(projectId);
        if (!project) {
          return this.formatter.formatError('Project', `Project not found: ${projectId}`);
        }
        const normalizedProject = project as { path?: string; directory?: string };
        const directory = normalizedProject.path || normalizedProject.directory || '';
        this.access.setWorkspaceRoot(session, directory);
        const cwdSet = this.access.setCwd(session, '.');
        if (!cwdSet.ok) {
          return this.formatter.formatError('Project', cwdSet.error || 'Failed to set project directory');
        }
        return this.formatter.formatSuccess('Project', `Using project ${projectId} at ${cwdSet.cwd}`);
      }

      case 'permission.reply': {
        if (!intent.permissionId) {
          return this.formatter.formatError('Permission', 'Missing permission ID');
        }
        const response = String(intent.response || 'once');
        const result = await this.adapter.replyPermission(
          context.sessionId,
          String(intent.permissionId),
          response,
          context,
        );
        return this.formatter.formatSuccess(
          'Permission',
          `Replied ${result.response} to permission ${result.permissionId}`,
        );
      }

      case 'output.get': {
        const runId = String(intent.runId || '').trim();
        const item = runId
          ? this.store.getRun(runId, session.phoneNumber)
          : this.store.listRuns(session.phoneNumber, 1)[0] || null;
        if (!item) {
          return this.formatter.formatRunLookup(null);
        }
        return this.formatter.formatRunLookup({
          id: item.run_id,
          commandType: item.command_type,
          raw: item.raw,
          createdAt: item.created_at,
        });
      }

      case 'output.runs': {
        const rows = this.store.listRuns(session.phoneNumber, 10);
        const items = rows.map((row) => ({
          id: row.run_id,
          commandType: row.command_type,
          createdAt: row.created_at,
        }));
        return this.formatter.formatRunList(items);
      }

      case 'abort': {
        const result = (await this.adapter.abort(context)) as { success: boolean; error?: string };
        if (!result.success) {
          return this.formatter.formatError(
            'Abort',
            result.error || 'Failed to abort active session.',
          );
        }
        return this.formatter.formatSuccess('Abort', 'Stopped active run(s).');
      }

      case 'model.status': {
        const model = await this.adapter.getModelStatus();
        return this.formatter.formatSuccess('Model Status', this.pretty(model));
      }

      case 'model.list': {
        const providers = await this.adapter.listProviders();
        const verbose = Boolean(intent.verbose);
        const providerId = String(intent.providerId || '').trim();
        if (verbose) {
          return this.formatter.formatSuccess('Model Providers', this.pretty(providers));
        }
        return this.formatter.formatSuccess(
          'Model Providers',
          this.formatModelProvidersSummary(providers, providerId),
        );
      }

      case 'model.set': {
        const providerId = String(intent.providerId || '');
        const modelId = String(intent.modelId || '');
        if (!providerId || !modelId) {
          return this.formatter.formatError('Model', 'Usage: /model set <providerId> <modelId>');
        }
        await this.adapter.setModel(providerId, modelId);
        return this.formatter.formatSuccess('Model', `Updated active model to ${providerId}/${modelId}`);
      }

      case 'tools.ids': {
        const ids = await this.adapter.listToolIds();
        return this.formatter.formatSuccess('Tools IDs', this.pretty(ids));
      }

      case 'tools.list': {
        const providerId = String(intent.providerId || '');
        const modelId = String(intent.modelId || '');
        const tools = await this.adapter.listTools(providerId, modelId);
        return this.formatter.formatSuccess('Tools', this.pretty(tools));
      }

      case 'mcp.status': {
        const mcp = await this.adapter.getMcpStatus();
        return this.formatter.formatSuccess('MCP Status', this.pretty(mcp));
      }

      case 'mcp.add': {
        const name = String(intent.name || '');
        const command = String(intent.command || '');
        if (!name || !command) {
          return this.formatter.formatError('MCP', 'Usage: /mcp add <name> <command>');
        }
        await this.adapter.addMcpServer(name, command);
        return this.formatter.formatSuccess('MCP', `Added MCP server ${name}`);
      }

      case 'mcp.connect': {
        const server = String(intent.server || '');
        if (!server) {
          return this.formatter.formatError('MCP', 'Usage: /mcp connect <server>');
        }
        await this.adapter.connectMcp(server);
        return this.formatter.formatSuccess('MCP', `Connected MCP server ${server}`);
      }

      case 'mcp.disconnect': {
        const server = String(intent.server || '');
        if (!server) {
          return this.formatter.formatError('MCP', 'Usage: /mcp disconnect <server>');
        }
        await this.adapter.disconnectMcp(server);
        return this.formatter.formatSuccess('MCP', `Disconnected MCP server ${server}`);
      }

      case 'skills.list': {
        const skills = await this.adapter.listSkills();
        return this.formatter.formatSuccess('Skills', this.pretty(skills));
      }

      case 'opencode.status': {
        const status = await this.adapter.getModelStatus();
        return this.formatter.formatSuccess('OpenCode Status', this.pretty(status));
      }

      case 'opencode.providers': {
        const providers = await this.adapter.listProviders();
        return this.formatter.formatSuccess('OpenCode Providers', this.pretty(providers));
      }

      case 'opencode.commands': {
        const commands = await this.adapter.listCommands();
        return this.formatter.formatSuccess('OpenCode Commands', this.pretty(commands));
      }

      case 'opencode.diagnostics': {
        const diagnostics = await this.adapter.getDiagnostics();
        const runtime = this.getRuntimeStatus();
        return this.formatter.formatSuccess(
          'OpenCode Diagnostics',
          this.pretty({ diagnostics, runtime }),
        );
      }

      default:
        return this.formatter.formatError('Execute', `Unsupported intent: ${intent.type}`);
    }
  }

  /**
   * Render compact JSON block for advanced diagnostics responses.
   */
  pretty(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  formatModelProvidersSummary(value: unknown, providerFilter = ''): string {
    const providers = this.extractProviders(value);
    const filtered = providerFilter
      ? providers.filter(
          (provider) =>
            String(provider.id || provider.name || '')
              .toLowerCase()
              .trim() === providerFilter.toLowerCase(),
        )
      : providers;

    if (filtered.length === 0) {
      return providerFilter
        ? `No provider found for \`${providerFilter}\`. Use \`/model list\` to see provider IDs.`
        : 'No providers found. Use `/model list full` for raw output.';
    }

    const flattened: string[] = [];
    for (const provider of filtered) {
      const providerId = String(provider.id || provider.name || '(unknown)');
      const modelsRecord = provider.models && typeof provider.models === 'object' ? provider.models : {};
      for (const modelId of Object.keys(modelsRecord as Record<string, unknown>)) {
        const model = (modelsRecord as Record<string, unknown>)[modelId] as { status?: string } | undefined;
        if (!model || !model.status || model.status === 'active') {
          flattened.push(`${providerId}/${modelId}`);
        }
      }
    }

    if (flattened.length === 0) {
      return 'No available models found. Use `/model list full` for raw output.';
    }

    flattened.sort((a, b) => a.localeCompare(b));
    const maxItems = providerFilter ? 120 : 60;
    const shown = flattened.slice(0, maxItems);
    const omitted = Math.max(0, flattened.length - shown.length);

    const lines = [
      `Available models: ${flattened.length}`,
      '',
      ...shown.map((entry) => `• \`${entry}\``),
    ];

    if (omitted > 0) {
      lines.push('', `...and ${omitted} more.`);
    }

    lines.push('', 'Tip: `/model set <providerId> <modelId>`');
    lines.push('Tip: `/model list <providerId>` to narrow results.');
    lines.push('Tip: `/model list full` for full raw JSON.');
    return lines.join('\n');
  }

  extractProviders(value: unknown): Array<{ id?: string; name?: string; models?: unknown }> {
    if (Array.isArray(value)) {
      return value as Array<{ id?: string; name?: string; models?: unknown }>;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.all)) {
        return obj.all as Array<{ id?: string; name?: string; models?: unknown }>;
      }
      if (Array.isArray(obj.providers)) {
        return obj.providers as Array<{ id?: string; name?: string; models?: unknown }>;
      }
    }

    return [];
  }
}
