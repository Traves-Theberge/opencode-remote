import { MessageFormatter } from '../presentation/formatter.js';

export class CommandExecutor {
  constructor(opencodeAdapter, accessController, store) {
    this.adapter = opencodeAdapter;
    this.access = accessController;
    this.store = store;
    this.formatter = new MessageFormatter();
  }

  async execute(intent, session) {
    const context = {
      sessionId: this.access.getActiveSessionId(session),
      directory: this.access.getCwd(session),
    };

    switch (intent.type) {
      case 'status': {
        return [
          this.formatter.header('Status'),
          '',
          '✅ OpenCode Remote is online',
          `🧵 Active session: ${context.sessionId || '(none)'}`,
          `📂 CWD: ${context.directory || '(unset)'}`,
          '',
          'Use `@oc /help` for control commands.',
        ].join('\n');
      }

      case 'prompt': {
        const result = await this.adapter.sendPrompt(intent.text, context);
        this.access.setActiveSessionId(session, result.sessionId);
        return this.formatter.formatPromptResult(result);
      }

      case 'run': {
        const startedAt = Date.now();
        const result = await this.adapter.runCommand(intent.command, context);
        return this.formatter.formatShellResult({
          command: intent.command,
          output: result.output,
          durationMs: Date.now() - startedAt,
        });
      }

      case 'shell': {
        const startedAt = Date.now();
        const result = await this.adapter.runShell(intent.command, context);
        return this.formatter.formatShellResult({
          command: intent.command,
          output: result.output,
          durationMs: Date.now() - startedAt,
        });
      }

      case 'file.read': {
        const result = await this.adapter.readFile(intent.path, context);
        return this.formatter.formatFileReadResult({
          path: intent.path,
          content: result.content,
        });
      }

      case 'file.write': {
        return this.formatter.formatWarning(
          'File Write',
          'V1 does not support direct file writes yet. Use @oc /run with an editor command.',
        );
      }

      case 'session.list': {
        const sessions = await this.adapter.listSessions(context);
        return this.formatter.formatSessionList(sessions);
      }

      case 'session.status': {
        const status = await this.adapter.getSessionStatus(intent.sessionId, context);
        const target = intent.sessionId || context.sessionId;
        return this.formatter.formatSessionStatus(status, target);
      }

      case 'session.use': {
        if (!intent.sessionId) {
          return this.formatter.formatError('Session', 'Missing session ID');
        }
        this.access.setActiveSessionId(session, intent.sessionId);
        this.adapter.setCurrentSessionId(intent.sessionId);
        return this.formatter.formatSuccess('Session', `Active session set to ${intent.sessionId}`);
      }

      case 'session.new': {
        const created = await this.adapter.createSession(
          intent.title || 'WhatsApp Remote Session',
          context,
        );
        this.access.setActiveSessionId(session, created.id);
        this.adapter.setCurrentSessionId(created.id);
        return this.formatter.formatSuccess('Session', `Created new session ${created.id}`);
      }

      case 'session.abort': {
        await this.adapter.abortSession(intent.sessionId, context);
        if (this.access.getActiveSessionId(session) === intent.sessionId) {
          this.access.setActiveSessionId(session, null);
        }
        return this.formatter.formatSuccess('Session Abort', `Aborted session ${intent.sessionId}`);
      }

      case 'diff': {
        const diff = await this.adapter.getDiff(intent.sessionId, context);
        return this.formatter.formatDiffResult(diff);
      }

      case 'summarize': {
        await this.adapter.summarize(intent.sessionId, context);
        return this.formatter.formatSuccess('Summarize', 'Session summarized.');
      }

      case 'path.pwd': {
        return this.formatter.formatSuccess('Path', `Current directory: ${context.directory || '(unset)'}`);
      }

      case 'path.cd': {
        const result = this.access.setCwd(session, intent.path);
        if (!result.ok) {
          return this.formatter.formatError('Path', result.error);
        }
        return this.formatter.formatSuccess('Path', `Directory changed to ${result.cwd}`);
      }

      case 'file.list': {
        const items = await this.adapter.listFiles(intent.path || '.', context);
        return this.formatter.formatFileList(items, intent.path || '.');
      }

      case 'find.files': {
        if (!intent.query) {
          return this.formatter.formatError('Find Files', 'Missing query');
        }
        const items = await this.adapter.findFiles(intent.query, context);
        return this.formatter.formatFindFilesResult(intent.query, items);
      }

      case 'find.text': {
        if (!intent.pattern) {
          return this.formatter.formatError('Find Text', 'Missing pattern');
        }
        const matches = await this.adapter.findText(intent.pattern, context);
        return this.formatter.formatFindTextResult(intent.pattern, matches);
      }

      case 'project.list': {
        const projects = await this.adapter.listProjects();
        if (!Array.isArray(projects) || projects.length === 0) {
          return this.formatter.formatWarning('Projects', 'No projects found.');
        }
        const lines = projects.slice(0, 20).map((project) => {
          const path = project.path || project.directory || '(unknown path)';
          return `• \`${project.id}\` · ${path}`;
        });
        return [
          this.formatter.header('Projects'),
          '',
          `📦 Found ${projects.length} project(s)`,
          ...lines,
          '',
          'Use `@oc /project use <id>` to switch path context.',
        ].join('\n');
      }

      case 'project.use': {
        if (!intent.projectId) {
          return this.formatter.formatError('Project', 'Missing project ID');
        }
        const project = await this.adapter.getProjectById(intent.projectId);
        if (!project) {
          return this.formatter.formatError('Project', `Project not found: ${intent.projectId}`);
        }
        const directory = project.path || project.directory;
        this.access.setWorkspaceRoot(session, directory);
        const cwdSet = this.access.setCwd(session, '.');
        if (!cwdSet.ok) {
          return this.formatter.formatError('Project', cwdSet.error);
        }
        return this.formatter.formatSuccess('Project', `Using project ${intent.projectId} at ${cwdSet.cwd}`);
      }

      case 'permission.reply': {
        if (!intent.permissionId) {
          return this.formatter.formatError('Permission', 'Missing permission ID');
        }
        const response = intent.response || 'once';
        const result = await this.adapter.replyPermission(
          context.sessionId,
          intent.permissionId,
          response,
          context,
        );
        return this.formatter.formatSuccess(
          'Permission',
          `Replied ${result.response} to permission ${result.permissionId}`,
        );
      }

      case 'output.get': {
        if (!intent.runId) {
          return this.formatter.formatError('Run Lookup', 'Missing run ID');
        }
        const item = this.store.getRun(intent.runId, session.phoneNumber);
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
        const result = await this.adapter.abort(context);
        if (!result.success) {
          return this.formatter.formatError(
            'Abort',
            result.error || 'Failed to abort active session.',
          );
        }
        return this.formatter.formatSuccess('Abort', 'Active session aborted.');
      }

      default:
        return this.formatter.formatError('Execute', `Unsupported intent: ${intent.type}`);
    }
  }
}
