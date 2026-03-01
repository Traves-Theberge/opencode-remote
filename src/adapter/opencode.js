import { createOpencodeClient } from '@opencode-ai/sdk';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';

export class OpenCodeAdapter {
  constructor() {
    this.client = null;
    this.server = null;
    this.currentSessionId = null;
    this.eventAbortController = null;
    this.eventLoop = null;
  }

  resolveSessionId(context = {}) {
    return context.sessionId || this.currentSessionId;
  }

  buildQuery(context = {}) {
    const query = {};
    if (context.directory) {
      query.directory = context.directory;
    }
    return Object.keys(query).length > 0 ? query : undefined;
  }

  async start() {
    const serverUrl = config.get('opencode.serverUrl');
    
    logger.info({ serverUrl }, 'Connecting to OpenCode server');
    
    try {
      this.client = createOpencodeClient({
        baseUrl: serverUrl,
      });

      const cfg = await this.client.config.get();
      logger.info({ connected: true, model: cfg?.data?.model }, 'OpenCode server connected');
      
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to connect to OpenCode server');
      return false;
    }
  }

  async createSession(title = 'WhatsApp Remote Session', context = {}) {
    try {
      const result = await this.client.session.create({
        body: { title },
        query: this.buildQuery(context),
      });
      
      this.currentSessionId = result.data.id;
      logger.info({ sessionId: this.currentSessionId }, 'Created new session');
      
      return result.data;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create session');
      throw error;
    }
  }

  async sendPrompt(text, options = {}) {
    const sessionId = this.resolveSessionId(options);
    
    if (!sessionId) {
      const session = await this.createSession('WhatsApp Remote Session', options);
      return this.sendPrompt(text, { ...options, sessionId: session.id });
    }

    try {
      const result = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text }],
        },
        query: this.buildQuery(options),
      });
      
      logger.info({ sessionId, messageId: result.data.info.id }, 'Prompt sent');
      
      return {
        sessionId,
        messageId: result.data.info.id,
        response: this.formatParts(result.data.parts),
      };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to send prompt');
      throw error;
    }
  }

  async runCommand(command, context = {}) {
    const sessionId = this.resolveSessionId(context);

    if (!sessionId) {
      throw new Error('No active session');
    }

    try {
      const result = await this.client.session.command({
        path: { id: sessionId },
        body: {
          command: 'exec',
          arguments: command,
        },
        query: this.buildQuery(context),
      });

      return {
        output: this.formatPayload(result.data),
      };
    } catch (error) {
      logger.warn({ err: error }, 'session.command failed, falling back to shell');
      return this.runShell(command, context);
    }
  }

  async runShell(command, context = {}) {
    const sessionId = this.resolveSessionId(context);
    
    if (!sessionId) {
      throw new Error('No active session');
    }

    try {
      const result = await this.client.session.shell({
        path: { id: sessionId },
        body: {
          agent: 'build',
          command,
        },
        query: this.buildQuery(context),
      });

      return {
        output: this.formatPayload(result.data),
      };
    } catch (error) {
      logger.error({ err: error, command }, 'Failed to run shell');
      throw error;
    }
  }

  async readFile(path, context = {}) {
    try {
      const result = await this.client.file.read({
        query: {
          path,
          directory: context.directory,
        },
      });

      return {
        content: result.data.content,
        type: result.data.type,
      };
    } catch (error) {
      logger.error({ err: error, path }, 'Failed to read file');
      throw error;
    }
  }

  async listSessions(context = {}) {
    try {
      const result = await this.client.session.list({
        query: this.buildQuery(context),
      });
      return result.data;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list sessions');
      throw error;
    }
  }

  async abortSession(sessionId, context = {}) {
    try {
      await this.client.session.abort({
        path: { id: sessionId },
        query: this.buildQuery(context),
      });
      
      return { success: true };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to abort session');
      throw error;
    }
  }

  async getDiff(sessionId, context = {}) {
    try {
      const result = await this.client.session.diff({
        path: { id: sessionId || this.resolveSessionId(context) },
        query: this.buildQuery(context),
      });

      return result.data;
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to get diff');
      throw error;
    }
  }

  async summarize(sessionId, context = {}) {
    try {
      const summaryModel = await this.getSummaryModel();
      await this.client.session.summarize({
        path: { id: sessionId || this.resolveSessionId(context) },
        body: summaryModel,
        query: this.buildQuery(context),
      });
      
      return { success: true };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to summarize');
      throw error;
    }
  }

  async abort(context = {}) {
    const sessionId = this.resolveSessionId(context);
    if (!sessionId) {
      return { success: false, error: 'No active session' };
    }

    return this.abortSession(sessionId, context);
  }

  async getCurrentPath() {
    try {
      const result = await this.client.path.get();
      const data = result?.data || {};
      return data.path || data.cwd || data.directory || null;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to get current path');
      return null;
    }
  }

  async listProjects() {
    const result = await this.client.project.list();
    return result.data || [];
  }

  async listFiles(pathQuery = '.', context = {}) {
    const result = await this.client.file.list({
      query: {
        path: pathQuery,
        directory: context.directory,
      },
    });
    return result.data || [];
  }

  async findFiles(query, context = {}) {
    const result = await this.client.find.files({
      query: {
        query,
        directory: context.directory,
      },
    });
    return result.data || [];
  }

  async findText(pattern, context = {}) {
    const result = await this.client.find.text({
      query: {
        pattern,
        directory: context.directory,
      },
    });
    return result.data || [];
  }

  async getSessionStatus(sessionId, context = {}) {
    const targetSessionId = sessionId || this.resolveSessionId(context);
    if (!targetSessionId) {
      return null;
    }

    const result = await this.client.session.status({
      path: {
        id: targetSessionId,
      },
      query: this.buildQuery(context),
    });

    return result.data || null;
  }

  async replyPermission(sessionId, permissionId, response, context = {}) {
    const targetSessionId = sessionId || this.resolveSessionId(context);
    if (!targetSessionId) {
      throw new Error('No active session');
    }

    const valid = ['once', 'always', 'reject'];
    if (!valid.includes(response)) {
      throw new Error('Invalid permission response. Use once, always, or reject.');
    }

    await this.client.postSessionIdPermissionsPermissionId({
      path: {
        id: targetSessionId,
        permissionID: permissionId,
      },
      body: {
        response,
      },
      query: this.buildQuery(context),
    });

    return { success: true, sessionId: targetSessionId, permissionId, response };
  }

  async getProjectById(projectId) {
    const projects = await this.listProjects();
    return projects.find((project) => project.id === projectId) || null;
  }

  setCurrentSessionId(sessionId) {
    this.currentSessionId = sessionId || null;
  }

  async subscribeGlobalEvents(onEvent) {
    if (!this.client?.global?.event?.sse) {
      throw new Error('Global event SSE is not available on this SDK build');
    }

    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }

    const controller = new AbortController();
    this.eventAbortController = controller;

    const streamResult = await this.client.global.event.sse({
      signal: controller.signal,
    });

    this.eventLoop = (async () => {
      try {
        for await (const event of streamResult.stream) {
          await onEvent(event);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.warn({ err: error }, 'Global event stream stopped unexpectedly');
        }
      }
    })();

    return () => controller.abort();
  }

  formatParts(parts) {
    if (!parts || !Array.isArray(parts)) {
      return '';
    }
    
    return parts
      .map(part => {
        if (part.type === 'text') {
          return part.text;
        }
        if (part.type === 'tool_use') {
          return `[${part.name}: ${JSON.stringify(part.input)}]`;
        }
        if (part.type === 'tool_result') {
          return `[Result: ${part.content}]`;
        }
        return JSON.stringify(part);
      })
      .join('\n');
  }

  formatPayload(payload) {
    if (!payload) {
      return '';
    }

    if (Array.isArray(payload.parts)) {
      return this.formatParts(payload.parts);
    }

    if (typeof payload === 'string') {
      return payload;
    }

    return JSON.stringify(payload, null, 2);
  }

  async getSummaryModel() {
    try {
      const providers = await this.client.config.providers();
      const defaults = providers?.data?.default || {};
      const firstKey = Object.keys(defaults)[0];
      if (firstKey && defaults[firstKey]) {
        return {
          providerID: firstKey,
          modelID: defaults[firstKey],
        };
      }
    } catch (error) {
      logger.warn({ err: error }, 'Unable to resolve summary model from providers');
    }

    return {
      providerID: 'anthropic',
      modelID: 'claude-3-5-sonnet-20241022',
    };
  }

  getCurrentSessionId() {
    return this.currentSessionId;
  }

  async stop() {
    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }

    if (this.eventLoop) {
      try {
        await this.eventLoop;
      } catch {
        // ignore shutdown stream errors
      }
      this.eventLoop = null;
    }

    if (this.server) {
      this.server.close();
    }
  }
}
