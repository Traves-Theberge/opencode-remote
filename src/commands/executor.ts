import { MessageFormatter } from '../presentation/formatter.js';
import type { OpenCodeAdapter } from '../adapter/opencode.js';
import type { AccessController, SessionState } from '../access/controller.js';
import type { LocalStore } from '../storage/sqlite.js';

interface IntentBase {
  type: string;
  [key: string]: unknown;
}

export class CommandExecutor {
  adapter: OpenCodeAdapter;
  access: AccessController;
  store: LocalStore;
  formatter: MessageFormatter;

  constructor(opencodeAdapter: OpenCodeAdapter, accessController: AccessController, store: LocalStore) {
    this.adapter = opencodeAdapter;
    this.access = accessController;
    this.store = store;
    this.formatter = new MessageFormatter();
  }

  async execute(intent: IntentBase, session: SessionState) {
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
        const result = await this.adapter.sendPrompt(String(intent.text || ''), context);
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
          'V1 does not support direct file writes yet. Use @oc /run with an editor command.',
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
        this.access.setActiveSessionId(session, created.id);
        this.adapter.setCurrentSessionId(created.id);
        return this.formatter.formatSuccess('Session', `Created new session ${created.id}`);
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
          return this.formatter.formatError('Path', result.error);
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
          'Use `@oc /project use <id>` to switch path context.',
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
          return this.formatter.formatError('Project', cwdSet.error);
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
        if (!intent.runId) {
          return this.formatter.formatError('Run Lookup', 'Missing run ID');
        }
        const item = this.store.getRun(String(intent.runId), session.phoneNumber);
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
        return this.formatter.formatSuccess('Abort', 'Active session aborted.');
      }

      default:
        return this.formatter.formatError('Execute', `Unsupported intent: ${intent.type}`);
    }
  }
}
