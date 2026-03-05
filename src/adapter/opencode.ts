import { createOpencodeClient } from '@opencode-ai/sdk';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { readFileSync } from 'node:fs';

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

interface AdapterContext {
  sessionId?: string | null;
  directory?: string | null;
  retryFreshSession?: boolean;
  allowBigPickleFallback?: boolean;
}

interface PromptFileAttachment {
  filePath: string;
  mimeType: string;
  filename?: string;
}

/**
 * Adapter over the OpenCode SDK for deterministic command execution.
 *
 * Keeps SDK shape handling localized and returns app-friendly response payloads.
 */
export class OpenCodeAdapter {
  client: OpencodeClient;
  currentSessionId: string | null;
  eventAbortController: AbortController | null;
  eventLoop: Promise<void> | null;

  constructor() {
    this.client = null as unknown as OpencodeClient;
    this.currentSessionId = null;
    this.eventAbortController = null;
    this.eventLoop = null;
  }

  /** Resolve effective session id from explicit context or current adapter state. */
  resolveSessionId(context: AdapterContext = {}): string | null {
    return context.sessionId || this.currentSessionId;
  }

  /** Build optional directory query object for SDK calls. */
  buildQuery(context: AdapterContext = {}): { directory?: string } | undefined {
    const query: { directory?: string } = {};
    if (context.directory) {
      query.directory = context.directory;
    }
    return Object.keys(query).length > 0 ? query : undefined;
  }

  /** Initialize OpenCode client and verify connectivity. */
  async start() {
    const serverUrl = String(config.get('opencode.serverUrl') || 'http://localhost:4096');
    
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

  /** Create a new OpenCode session and set adapter current session pointer. */
  async createSession(title = 'WhatsApp Remote Session', context: AdapterContext = {}) {
    try {
      const result = await this.client.session.create({
        body: { title },
        query: this.buildQuery(context),
      });
      
      const data = result.data;
      if (!data?.id) {
        throw new Error('Session create returned no id');
      }
      this.currentSessionId = data.id;
      logger.info({ sessionId: this.currentSessionId }, 'Created new session');
      
      return data;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create session');
      throw error;
    }
  }

  /** Send prompt text to OpenCode prompt endpoint. */
  async sendPrompt(
    text: string,
    options: AdapterContext & { files?: PromptFileAttachment[] } = {},
  ): Promise<{ sessionId: string; messageId: string; response: string }> {
    const sessionId = this.resolveSessionId(options);
    
    if (!sessionId) {
      const session = await this.createSession('WhatsApp Remote Session', options);
      return this.sendPrompt(text, { ...options, sessionId: session.id });
    }

    try {
      const result = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: this.buildPromptParts(text, options.files || []) as never,
        },
        query: this.buildQuery(options),
      });
      
      const data = result.data;
      const messageId = String(data?.info?.id || '');
      logger.info({ sessionId, messageId }, 'Prompt sent');
      let response = this.formatParts(data?.parts || []);

      if (!response.trim() && messageId) {
        response = await this.waitForMessageResponse(sessionId, messageId, options);
      }

      if (!response.trim()) {
        response = this.extractMessageErrorText(data?.info) || '';
      }

      if (this.shouldRetryWithFreshSession(data?.info, response, options)) {
        logger.warn({ sessionId, messageId }, 'Prompt failed due unsupported model; falling back to big-pickle');
        await this.setModelById('opencode/big-pickle');
        const fresh = await this.createSession('WhatsApp Remote Session', options);
        return this.sendPrompt(text, {
          ...options,
          sessionId: fresh.id,
          retryFreshSession: false,
          allowBigPickleFallback: false,
        });
      }
      
      return {
        sessionId,
        messageId,
        response,
      };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to send prompt');
      throw error;
    }
  }

  buildPromptParts(text: string, files: PromptFileAttachment[]): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [{ type: 'text', text }];

    for (const file of files) {
      const dataUrl = this.toDataUrl(file.filePath, file.mimeType);
      if (!dataUrl) {
        continue;
      }
      parts.push({
        type: 'file',
        mime: file.mimeType,
        filename: file.filename || undefined,
        url: dataUrl,
      });
    }

    return parts;
  }

  toDataUrl(filePath: string, mimeType: string): string | null {
    try {
      const bytes = readFileSync(filePath);
      const base64 = bytes.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      logger.warn({ err: error, filePath }, 'Failed to encode attachment as data URL');
      return null;
    }
  }

  async waitForMessageResponse(sessionId: string, messageId: string, context: AdapterContext): Promise<string> {
    const timeoutMs = Math.max(5_000, Number(config.get('opencode.promptResponseTimeoutMs')) || 90_000);
    const intervalMs = Math.max(500, Number(config.get('opencode.promptResponsePollIntervalMs')) || 1500);
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      try {
        const result = await this.client.session.message({
          path: {
            id: sessionId,
            messageID: messageId,
          },
          query: this.buildQuery(context),
        });

        const data = result?.data;
        const response = this.formatParts(data?.parts || []);
        const info = data?.info as { role?: string; time?: { completed?: number } } | undefined;
        const completed = info?.role === 'assistant' && typeof info?.time?.completed === 'number';

        const messageError = this.extractMessageErrorText(data?.info);
        if (messageError) {
          return messageError;
        }

        if (response.trim()) {
          return response;
        }

        if (completed) {
          return '';
        }
      } catch (error) {
        logger.warn({ err: error, sessionId, messageId }, 'Failed polling prompt response message');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    logger.warn({ sessionId, messageId, timeoutMs }, 'Timed out waiting for prompt response payload');
    return '';
  }

  extractMessageErrorText(info: unknown): string | null {
    if (!info || typeof info !== 'object') {
      return null;
    }

    const error = (info as { error?: unknown }).error;
    if (!error || typeof error !== 'object') {
      return null;
    }

    const nestedMessage = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim();
    }

    const directMessage = (error as { message?: unknown }).message;
    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage.trim();
    }

    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }

    return null;
  }

  shouldRetryWithFreshSession(info: unknown, response: string, context: AdapterContext): boolean {
    if (context.retryFreshSession === false) {
      return false;
    }

    if (context.allowBigPickleFallback === false) {
      return false;
    }

    const summary = Boolean((info as { summary?: unknown } | null | undefined)?.summary);
    if (!summary) {
      return false;
    }

    return this.isUnsupportedCodexModelError(response);
  }

  isUnsupportedCodexModelError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return text.includes('model is not supported') && text.includes('chatgpt account');
  }

  async setModelById(model: string) {
    const modelId = String(model || '').trim();
    if (!modelId) {
      throw new Error('Missing model id');
    }

    const current = await this.client.config.get();
    const body = {
      ...(current?.data || {}),
      model: modelId,
    };

    const result = await this.client.config.update({ body: body as never });
    return result?.data || null;
  }

  /** Execute command via command endpoint, with shell fallback compatibility. */
  async runCommand(command: string, context: AdapterContext = {}) {
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
        output: this.formatPayload(result.data || ''),
      };
    } catch (error) {
      logger.warn({ err: error }, 'session.command failed, falling back to shell');
      return this.runShell(command, context);
    }
  }

  /** Execute shell command via shell endpoint. */
  async runShell(command: string, context: AdapterContext = {}) {
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

  async readFile(path: string, context: AdapterContext = {}) {
    try {
      const result = await this.client.file.read({
        query: {
          path,
          directory: context.directory || undefined,
        },
      });

      const data = result.data;
      return {
        content: data?.content || '',
        type: data?.type || 'text',
      };
    } catch (error) {
      logger.error({ err: error, path }, 'Failed to read file');
      throw error;
    }
  }

  async listSessions(context: AdapterContext = {}) {
    try {
      const result = await this.client.session.list({
        query: this.buildQuery(context),
      });
      return result.data || [];
    } catch (error) {
      logger.error({ err: error }, 'Failed to list sessions');
      throw error;
    }
  }

  async abortSession(sessionId: string, context: AdapterContext = {}) {
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

  async getDiff(sessionId: string | null, context: AdapterContext = {}) {
    try {
      const targetSessionId = sessionId || this.resolveSessionId(context);
      if (!targetSessionId) {
        throw new Error('No active session');
      }
      const result = await this.client.session.diff({
        path: { id: targetSessionId },
        query: this.buildQuery(context),
      });

      return result.data || [];
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to get diff');
      throw error;
    }
  }

  async summarize(sessionId: string | null, context: AdapterContext = {}) {
    try {
      const targetSessionId = sessionId || this.resolveSessionId(context);
      if (!targetSessionId) {
        throw new Error('No active session');
      }
      const summaryModel = await this.getSummaryModel();
      await this.client.session.summarize({
        path: { id: targetSessionId },
        body: summaryModel,
        query: this.buildQuery(context),
      });
      
      return { success: true };
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to summarize');
      throw error;
    }
  }

  async abort(context: AdapterContext = {}) {
    const sessionId = this.resolveSessionId(context);
    if (!sessionId) {
      return { success: false, error: 'No active session' };
    }

    return this.abortSession(sessionId, context);
  }

  async getCurrentPath() {
    try {
      const result = await this.client.path.get();
      const data = (result?.data || {}) as { path?: string; cwd?: string; directory?: string };
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

  async listFiles(pathQuery = '.', context: AdapterContext = {}) {
    const result = await this.client.file.list({
      query: {
        path: pathQuery,
        directory: context.directory || undefined,
      },
    });
    return result.data || [];
  }

  async findFiles(query: string, context: AdapterContext = {}) {
    const result = await this.client.find.files({
      query: {
        query,
        directory: context.directory || undefined,
      },
    });
    return result.data || [];
  }

  async findText(pattern: string, context: AdapterContext = {}) {
    const result = await this.client.find.text({
      query: {
        pattern,
        directory: context.directory || undefined,
      },
    });
    return result.data || [];
  }

  async getSessionStatus(sessionId: string | null, context: AdapterContext = {}) {
    const targetSessionId = sessionId || this.resolveSessionId(context);
    if (!targetSessionId) {
      return null;
    }

    const result = await this.client.session.status({
      path: {
        id: targetSessionId,
      },
      query: this.buildQuery(context),
    } as never);

    return result.data || null;
  }

  async replyPermission(
    sessionId: string | null,
    permissionId: string,
    response: string,
    context: AdapterContext = {},
  ) {
    const targetSessionId = sessionId || this.resolveSessionId(context);
    if (!targetSessionId) {
      throw new Error('No active session');
    }

    if (response !== 'once' && response !== 'always' && response !== 'reject') {
      throw new Error('Invalid permission response. Use once, always, or reject.');
    }

    await this.client.postSessionIdPermissionsPermissionId({
      path: {
        id: targetSessionId,
        permissionID: permissionId,
      },
      body: {
        response: response as 'once' | 'always' | 'reject',
      },
      query: this.buildQuery(context),
    } as never);

    return { success: true, sessionId: targetSessionId, permissionId, response };
  }

  async getProjectById(projectId: string) {
    const projects = await this.listProjects();
    return projects.find((project) => project.id === projectId) || null;
  }

  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId || null;
  }

  async subscribeGlobalEvents(onEvent: (event: unknown) => Promise<void>) {
    const eventApi = (this.client.global.event as unknown as {
      sse?: (options?: { signal?: AbortSignal }) => Promise<{ stream: AsyncIterable<unknown> }>;
    }).sse;

    if (!eventApi) {
      throw new Error('Global event SSE is not available on this SDK build');
    }

    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }

    const controller = new AbortController();
    this.eventAbortController = controller;

    const streamResult = await eventApi({
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

  formatParts(parts: Array<{ type?: string; text?: string; name?: string; input?: unknown; content?: string }>) {
    if (!parts || !Array.isArray(parts)) {
      return '';
    }
    
    return parts
      .map((part) => {
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

  formatPayload(payload: { parts?: Array<{ type?: string; text?: string; name?: string; input?: unknown; content?: string }> } | string | unknown) {
    if (!payload) {
      return '';
    }

    if (typeof payload === 'object' && payload !== null && 'parts' in payload) {
      const parts = (payload as { parts?: Array<{ type?: string; text?: string; name?: string; input?: unknown; content?: string }> }).parts;
      if (Array.isArray(parts)) {
        return this.formatParts(parts);
      }
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

  async getModelStatus() {
    const cfg = await this.client.config.get();
    const providers = await this.client.config.providers();
    return {
      config: cfg?.data || null,
      providers: providers?.data || null,
    };
  }

  async listProviders() {
    const result = await this.client.provider.list();
    return result?.data || [];
  }

  async setModel(providerId: string, modelId: string) {
    if (!providerId || !modelId) {
      throw new Error('Missing providerId or modelId');
    }

    const current = await this.client.config.get();
    const body = {
      ...(current?.data || {}),
      model: {
        providerID: providerId,
        modelID: modelId,
      },
    };

    const result = await this.client.config.update({
      body: body as never,
    });

    return result?.data || null;
  }

  async listToolIds() {
    const result = await this.client.tool.ids();
    return result?.data || [];
  }

  async listTools(providerId: string, modelId: string) {
    const resolved = providerId && modelId ? { providerID: providerId, modelID: modelId } : await this.getSummaryModel();
    const result = await this.client.tool.list({
      query: {
        providerID: resolved.providerID,
        modelID: resolved.modelID,
      } as never,
    });
    return result?.data || [];
  }

  async getMcpStatus() {
    const result = await this.client.mcp.status();
    return result?.data || [];
  }

  async addMcpServer(name: string, command: string) {
    if (!name || !command) {
      throw new Error('Missing MCP name or command');
    }
    const result = await this.client.mcp.add({
      body: {
        name,
        command,
      } as never,
    });
    return result?.data || null;
  }

  async connectMcp(server: string) {
    if (!server) {
      throw new Error('Missing MCP server id/name');
    }
    const result = await this.client.mcp.connect({
      path: {
        id: server,
      } as never,
    });
    return result?.data || null;
  }

  async disconnectMcp(server: string) {
    if (!server) {
      throw new Error('Missing MCP server id/name');
    }
    const result = await this.client.mcp.disconnect({
      path: {
        id: server,
      } as never,
    });
    return result?.data || null;
  }

  async listSkills() {
    const result = await this.client.app.agents();
    return result?.data || [];
  }

  async listCommands() {
    const result = await this.client.command.list();
    return result?.data || [];
  }

  async getDiagnostics() {
    const [pathInfo, lsp, formatter, vcs] = await Promise.all([
      this.client.path.get().catch(() => null),
      this.client.lsp.status().catch(() => null),
      this.client.formatter.status().catch(() => null),
      this.client.vcs.get().catch(() => null),
    ]);

    return {
      path: pathInfo?.data || null,
      lsp: lsp?.data || null,
      formatter: formatter?.data || null,
      vcs: vcs?.data || null,
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

  }
}
