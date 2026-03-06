import { logger } from '../core/logger.js';
import { config } from '../core/config.js';
import type { SessionState } from '../access/controller.js';

interface ParsedCommand {
  command: string;
  tier: string;
  args: string[];
  raw: string;
}

interface RouteContext {
  sender: string;
  role: string;
}

interface AccessControllerLike {
  createConfirm(action: { type: string; args: string[]; context: RouteContext }, session: SessionState): string;
  verifyConfirm(
    confirmId: string,
    session: SessionState,
  ): { valid: boolean; error?: string; action?: { type: string; args: string[]; context: RouteContext } };
  listAllowedNumbers(): string[];
  isOwner(phoneNumber: string): boolean;
  addAllowedNumber(number: string, addedBy: string): void;
  removeAllowedNumber(number: string, removedBy: string): void;
  bindTelegramUser(phone: string, telegramUserId: string, telegramUsername: string | null, actor: string): void;
  unbindTelegramUser(telegramUserId: string, actor: string): void;
  listTelegramBindings(): Array<{ phone: string; telegram_user_id: string; telegram_username: string | null }>;
  sessions: Map<string, SessionState>;
}

const COMMAND_TIERS = {
  status: 'safe',
  help: 'safe',
  confirm: 'safe',
  'users list': 'safe',
  'users add': 'safe',
  'users remove': 'safe',
  'users bindtg': 'safe',
  'users unbindtg': 'safe',
  'users tglist': 'safe',
  lock: 'safe',
  unlock: 'safe',
  pwd: 'safe',
  cd: 'safe',
  ls: 'safe',
  find: 'safe',
  grep: 'safe',
  projects: 'safe',
  'project use': 'safe',
  'session list': 'safe',
  'session status': 'safe',
  'session use': 'safe',
  'session new': 'safe',
  'permission reply': 'safe',
  'output get': 'safe',
  'output runs': 'safe',
  diff: 'safe',
  summarize: 'safe',
  'model status': 'safe',
  'model list': 'safe',
  'model set': 'dangerous',
  'tools ids': 'safe',
  'tools list': 'safe',
  'mcp status': 'safe',
  'mcp add': 'dangerous',
  'mcp connect': 'dangerous',
  'mcp disconnect': 'dangerous',
  'skills list': 'safe',
  'opencode status': 'safe',
  'opencode providers': 'safe',
  'opencode commands': 'safe',
  'opencode diagnostics': 'safe',
  prompt: 'elevated',
  'session abort': 'dangerous',
  abort: 'dangerous',
};

export class CommandRouter {
  accessController: AccessControllerLike;

  constructor(accessController: AccessControllerLike) {
    this.accessController = accessController;
  }

  /**
   * Parse incoming text into command/tier/args.
   */
  async parse(rawMessage: string): Promise<ParsedCommand | null> {
    const text = rawMessage.trim();
    if (!text) {
      return null;
    }

    const content = text;
    if (!content) {
      return this.toParsed('help', []);
    }

    if (!content.startsWith('/')) {
      return this.toParsed('prompt', [content]);
    }

    return this.parseSlashCommand(content);
  }

  parseSlashCommand(content: string): ParsedCommand {
    const line = content.slice(1).trim();
    const parts = line.split(/\s+/).filter(Boolean);
    const base = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1);

    if (!base) {
      return this.toParsed('help', []);
    }

    switch (base) {
      case 'help':
        return this.toParsed('help', []);
      case 'status':
        return this.toParsed('status', []);
      case 'last':
      case 'latest':
        return this.toParsed('output get', ['']);
      case 'runs':
        return this.toParsed('output runs', []);
      case 'confirm':
        return this.toParsed('confirm', [rest[0] || '']);
      case 'lock':
        return this.toParsed('lock', []);
      case 'unlock':
        return this.toParsed('unlock', []);
      case 'pwd':
        return this.toParsed('pwd', []);
      case 'cd':
        return this.toParsed('cd', [rest.join(' ')]);
      case 'ls':
        return this.toParsed('ls', [rest.join(' ')]);
      case 'find':
        return this.toParsed('find', [rest.join(' ')]);
      case 'grep':
        return this.toParsed('grep', [rest.join(' ')]);
      case 'abort':
        return this.toParsed('abort', []);
      case 'permission':
      case 'perm':
        return this.parsePermission(rest);
      case 'allow':
        return this.toParsed('permission reply', [rest[0] || '', rest[1] || 'once']);
      case 'deny':
      case 'reject':
        return this.toParsed('permission reply', [rest[0] || '', 'reject']);
      case 'projects':
        return this.toParsed('projects', []);
      case 'project':
        return this.parseProject(rest);
      case 'model':
        return this.parseModel(rest);
      case 'tools':
      case 'tool':
        return this.parseTools(rest);
      case 'mcp':
        return this.parseMcp(rest);
      case 'skills':
      case 'agents':
        return this.parseSkills(rest);
      case 'opencode':
        return this.parseOpencode(rest);
      case 'run':
      case 'shell':
        return this.toParsed('prompt', [rest.join(' ').trim() || line]);
      case 'prompt':
        return this.toParsed('prompt', [rest.join(' ')]);
      case 'users':
        return this.parseUsers(rest);
      case 'session':
        return this.parseSession(rest);
      case 'diff':
        return this.toParsed('diff', rest[0] ? [rest[0]] : []);
      case 'summarize':
      case 'summary':
        return this.toParsed('summarize', rest[0] ? [rest[0]] : []);
      default:
        return this.toParsed(`/${base}`, rest);
    }
  }

  parseUsers(parts: string[]): ParsedCommand {
    const action = (parts[0] || '').toLowerCase();
    if (action === 'list') {
      return this.toParsed('users list', []);
    }
    if (action === 'add') {
      return this.toParsed('users add', [this.extractPhone(parts.slice(1))]);
    }
    if (action === 'remove') {
      return this.toParsed('users remove', [this.extractPhone(parts.slice(1))]);
    }
    if (action === 'bindtg') {
      return this.toParsed('users bindtg', [parts[1] || '', this.extractPhone(parts.slice(2)), parts[3] || '']);
    }
    if (action === 'unbindtg') {
      return this.toParsed('users unbindtg', [parts[1] || '']);
    }
    if (action === 'tglist') {
      return this.toParsed('users tglist', []);
    }
    return this.toParsed('help', []);
  }

  parseSession(parts: string[]): ParsedCommand {
    const action = (parts[0] || '').toLowerCase();
    if (action === 'list') {
      return this.toParsed('session list', []);
    }
    if (action === 'status') {
      return this.toParsed('session status', [parts[1] || '']);
    }
    if (action === 'use') {
      return this.toParsed('session use', [parts[1] || '']);
    }
    if (action === 'new' || action === 'create') {
      return this.toParsed('session new', [parts.slice(1).join(' ')]);
    }
    if (action === 'abort') {
      return this.toParsed('session abort', [parts[1] || '']);
    }
    return this.toParsed('help', []);
  }

  parsePermission(parts: string[]): ParsedCommand {
    const permissionId = parts[0] || '';
    const response = (parts[1] || 'once').toLowerCase();
    return this.toParsed('permission reply', [permissionId, response]);
  }

  parseProject(parts: string[]): ParsedCommand {
    const action = (parts[0] || '').toLowerCase();
    if (action === 'use') {
      return this.toParsed('project use', [parts[1] || '']);
    }
    return this.toParsed('help', []);
  }

  parseModel(parts: string[]): ParsedCommand {
    const action = (parts[0] || 'status').toLowerCase();
    if (action === 'status') {
      return this.toParsed('model status', []);
    }
    if (action === 'list' || action === 'providers') {
      return this.toParsed('model list', [parts[1] || '', parts[2] || '']);
    }
    if (action === 'set') {
      return this.toParsed('model set', [parts[1] || '', parts.slice(2).join(' ').trim()]);
    }
    return this.toParsed('help', []);
  }

  parseTools(parts: string[]): ParsedCommand {
    const action = (parts[0] || 'ids').toLowerCase();
    if (action === 'ids') {
      return this.toParsed('tools ids', []);
    }
    if (action === 'list') {
      return this.toParsed('tools list', [parts[1] || '', parts[2] || '']);
    }
    return this.toParsed('help', []);
  }

  parseMcp(parts: string[]): ParsedCommand {
    const action = (parts[0] || 'status').toLowerCase();
    if (action === 'status') {
      return this.toParsed('mcp status', []);
    }
    if (action === 'add') {
      return this.toParsed('mcp add', [parts[1] || '', parts.slice(2).join(' ')]);
    }
    if (action === 'connect') {
      return this.toParsed('mcp connect', [parts[1] || '']);
    }
    if (action === 'disconnect') {
      return this.toParsed('mcp disconnect', [parts[1] || '']);
    }
    return this.toParsed('help', []);
  }

  parseSkills(parts: string[]): ParsedCommand {
    const action = (parts[0] || 'list').toLowerCase();
    if (action === 'list') {
      return this.toParsed('skills list', []);
    }
    return this.toParsed('help', []);
  }

  parseOpencode(parts: string[]): ParsedCommand {
    const action = (parts[0] || 'status').toLowerCase();
    if (action === 'status') {
      return this.toParsed('opencode status', []);
    }
    if (action === 'providers') {
      return this.toParsed('opencode providers', []);
    }
    if (action === 'commands') {
      return this.toParsed('opencode commands', []);
    }
    if (action === 'diagnostics') {
      return this.toParsed('opencode diagnostics', []);
    }
    return this.toParsed('help', []);
  }

  extractPhone(tokens: string[]): string {
    for (const token of tokens) {
      const normalized = config.normalizePhone(token);
      if (config.isValidPhone(normalized)) {
        return normalized;
      }
    }
    return '';
  }

  toParsed(command: string, args: string[]): ParsedCommand {
    const tier =
      command in COMMAND_TIERS
        ? COMMAND_TIERS[command as keyof typeof COMMAND_TIERS]
        : 'safe';
    return {
      command,
      tier,
      args,
      raw: [command, ...args].join(' '),
    };
  }

  /**
   * Route parsed command through tier policy and command handlers.
   */
  async route(parsed: ParsedCommand, session: SessionState, context: RouteContext) {
    const { command, tier, args } = parsed;
    logger.info({ command, tier, session: session.phoneNumber }, 'Routing command');

    if (tier === 'dangerous' && !session.confirmed) {
      const confirmId = this.accessController.createConfirm(
        { type: command, args, context },
        session,
      );
      return this.formatPendingConfirmation(confirmId, command);
    }

    const handler = this.getHandler(command);
    if (!handler) {
      return this.formatError(`Unknown command: ${command}`);
    }

    return handler(args, session);
  }

  getHandler(command: string) {
    const handlers = {
      status: this.handleStatus.bind(this),
      help: this.handleHelp.bind(this),
      prompt: this.handlePrompt.bind(this),
      run: this.handlePrompt.bind(this),
      shell: this.handlePrompt.bind(this),
      'session list': this.handleSessionList.bind(this),
      'session status': this.handleSessionStatus.bind(this),
      'session use': this.handleSessionUse.bind(this),
      'session new': this.handleSessionNew.bind(this),
      'session abort': this.handleSessionAbort.bind(this),
      pwd: this.handlePwd.bind(this),
      cd: this.handleCd.bind(this),
      ls: this.handleLs.bind(this),
      find: this.handleFind.bind(this),
      grep: this.handleGrep.bind(this),
      projects: this.handleProjects.bind(this),
      'project use': this.handleProjectUse.bind(this),
      'permission reply': this.handlePermissionReply.bind(this),
      'output get': this.handleOutputGet.bind(this),
      'output runs': this.handleOutputRuns.bind(this),
      diff: this.handleDiff.bind(this),
      summarize: this.handleSummarize.bind(this),
      'model status': this.handleModelStatus.bind(this),
      'model list': this.handleModelList.bind(this),
      'model set': this.handleModelSet.bind(this),
      'tools ids': this.handleToolsIds.bind(this),
      'tools list': this.handleToolsList.bind(this),
      'mcp status': this.handleMcpStatus.bind(this),
      'mcp add': this.handleMcpAdd.bind(this),
      'mcp connect': this.handleMcpConnect.bind(this),
      'mcp disconnect': this.handleMcpDisconnect.bind(this),
      'skills list': this.handleSkillsList.bind(this),
      'opencode status': this.handleOpencodeStatus.bind(this),
      'opencode providers': this.handleOpencodeProviders.bind(this),
      'opencode commands': this.handleOpencodeCommands.bind(this),
      'opencode diagnostics': this.handleOpencodeDiagnostics.bind(this),
      abort: this.handleAbort.bind(this),
      confirm: this.handleConfirm.bind(this),
      'users list': this.handleUsersList.bind(this),
      'users add': this.handleUsersAdd.bind(this),
      'users remove': this.handleUsersRemove.bind(this),
      'users bindtg': this.handleUsersBindTelegram.bind(this),
      'users unbindtg': this.handleUsersUnbindTelegram.bind(this),
      'users tglist': this.handleUsersTelegramList.bind(this),
      lock: this.handleLock.bind(this),
      unlock: this.handleUnlock.bind(this),
    };

    return handlers[command as keyof typeof handlers];
  }

  async handleStatus() {
    return { type: 'status' };
  }

  async handlePrompt(args: string[]) {
    return { type: 'prompt', text: args.join(' ').trim() };
  }

  async handleSessionList() {
    return { type: 'session.list' };
  }

  async handleSessionStatus(args: string[]) {
    return { type: 'session.status', sessionId: args[0] || null };
  }

  async handleSessionUse(args: string[]) {
    return { type: 'session.use', sessionId: args[0] };
  }

  async handleSessionNew(args: string[]) {
    return { type: 'session.new', title: args.join(' ').trim() };
  }

  async handleSessionAbort(args: string[]) {
    return { type: 'session.abort', sessionId: args[0] };
  }

  async handleDiff(args: string[]) {
    return { type: 'diff', sessionId: args[0] || null };
  }

  async handleSummarize(args: string[]) {
    return { type: 'summarize', sessionId: args[0] || null };
  }

  async handlePwd() {
    return { type: 'path.pwd' };
  }

  async handleCd(args: string[]) {
    return { type: 'path.cd', path: args.join(' ').trim() };
  }

  async handleLs(args: string[]) {
    return { type: 'file.list', path: args.join(' ').trim() || '.' };
  }

  async handleFind(args: string[]) {
    return { type: 'find.files', query: args.join(' ').trim() };
  }

  async handleGrep(args: string[]) {
    return { type: 'find.text', pattern: args.join(' ').trim() };
  }

  async handleProjects() {
    return { type: 'project.list' };
  }

  async handleProjectUse(args: string[]) {
    return { type: 'project.use', projectId: args[0] };
  }

  async handlePermissionReply(args: string[]) {
    return {
      type: 'permission.reply',
      permissionId: args[0],
      response: (args[1] || 'once').toLowerCase(),
    };
  }

  async handleOutputGet(args: string[]) {
    return {
      type: 'output.get',
      runId: args[0],
    };
  }

  async handleOutputRuns() {
    return {
      type: 'output.runs',
    };
  }

  async handleAbort() {
    return { type: 'abort' };
  }

  async handleModelStatus() {
    return { type: 'model.status' };
  }

  async handleModelList(args: string[]) {
    const rawA = String(args[0] || '').trim();
    const rawB = String(args[1] || '').trim();
    const a = rawA.toLowerCase();
    const b = rawB.toLowerCase();
    const verbose = a === 'full' || a === 'raw' || b === 'full' || b === 'raw';
    const providerId =
      a && a !== 'full' && a !== 'raw' ? rawA : b && b !== 'full' && b !== 'raw' ? rawB : '';
    return { type: 'model.list', verbose, providerId };
  }

  async handleModelSet(args: string[], session: SessionState): Promise<{ type: string; providerId: string; modelId: string } | string> {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can change the active model';
    }
    return { type: 'model.set', providerId: args[0] || '', modelId: args[1] || '' };
  }

  async handleToolsIds() {
    return { type: 'tools.ids' };
  }

  async handleToolsList(args: string[]) {
    return { type: 'tools.list', providerId: args[0] || '', modelId: args[1] || '' };
  }

  async handleMcpStatus() {
    return { type: 'mcp.status' };
  }

  async handleMcpAdd(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can add MCP servers';
    }
    return { type: 'mcp.add', name: args[0] || '', command: args[1] || '' };
  }

  async handleMcpConnect(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can connect MCP servers';
    }
    return { type: 'mcp.connect', server: args[0] || '' };
  }

  async handleMcpDisconnect(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can disconnect MCP servers';
    }
    return { type: 'mcp.disconnect', server: args[0] || '' };
  }

  async handleSkillsList() {
    return { type: 'skills.list' };
  }

  async handleOpencodeStatus() {
    return { type: 'opencode.status' };
  }

  async handleOpencodeProviders() {
    return { type: 'opencode.providers' };
  }

  async handleOpencodeCommands() {
    return { type: 'opencode.commands' };
  }

  async handleOpencodeDiagnostics() {
    return { type: 'opencode.diagnostics' };
  }

  async handleConfirm(args: string[], session: SessionState): Promise<unknown> {
    const confirmId = String(args[0] || '').toUpperCase();
    const result = this.accessController.verifyConfirm(confirmId, session);

    if (!result.valid) {
      return `❌ ${result.error}`;
    }

    const action = result.action;
    if (!action) {
      return '❌ Confirmation action missing';
    }

    const { type, args: actionArgs } = action;
    const handler = this.getHandler(type);
    if (!handler) {
      return this.formatError(`Unknown command: ${type}`);
    }

    session.confirmed = true;
    try {
      return await handler(actionArgs, session);
    } finally {
      session.confirmed = false;
    }
  }

  async handleUsersList() {
    const numbers = this.accessController.listAllowedNumbers();
    const list = numbers.map((number) => `• ${number}`).join('\n');
    return `📋 Allowed users:\n${list || '(none)'}`;
  }

  async handleUsersAdd(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can add users';
    }

    const phone = args[0];
    if (!phone) {
      return '❌ Missing phone number. Example: /users add +15551234567';
    }

    this.accessController.addAllowedNumber(phone, session.phoneNumber);
    return `✅ Added ${phone} to allowlist`;
  }

  async handleUsersRemove(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can remove users';
    }

    const phone = args[0];
    if (!phone) {
      return '❌ Missing phone number. Example: /users remove +15551234567';
    }

    this.accessController.removeAllowedNumber(phone, session.phoneNumber);
    return `✅ Removed ${phone} from allowlist`;
  }

  async handleUsersBindTelegram(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can bind Telegram users';
    }

    const telegramUserId = String(args[0] || '').trim();
    const phone = args[1];
    const username = String(args[2] || '').replace(/^@/, '');

    if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
      return '❌ Missing or invalid Telegram user ID. Example: /users bindtg 123456789 +15551234567 alice';
    }
    if (!phone) {
      return '❌ Missing phone number. Example: /users bindtg 123456789 +15551234567 alice';
    }

    try {
      this.accessController.bindTelegramUser(phone, telegramUserId, username || null, session.phoneNumber);
      return `✅ Bound Telegram user ${telegramUserId} to ${phone}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bind Telegram user';
      return `❌ ${message}`;
    }
  }

  async handleUsersUnbindTelegram(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can unbind Telegram users';
    }

    const telegramUserId = String(args[0] || '').trim();
    if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
      return '❌ Missing or invalid Telegram user ID. Example: /users unbindtg 123456789';
    }

    this.accessController.unbindTelegramUser(telegramUserId, session.phoneNumber);
    return `✅ Unbound Telegram user ${telegramUserId}`;
  }

  async handleUsersTelegramList(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can list Telegram bindings';
    }

    const bindings = this.accessController.listTelegramBindings();
    if (!bindings.length) {
      return '📋 No Telegram bindings found.';
    }

    const lines = bindings.map(
      (item) =>
        `• ${item.phone} ↔ ${item.telegram_user_id}${item.telegram_username ? ` (@${item.telegram_username})` : ''}`,
    );

    return ['📋 Telegram bindings:', ...lines].join('\n');
  }

  async handleLock(_args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can lock the system';
    }

    for (const userSession of this.accessController.sessions.values()) {
      userSession.locked = true;
    }

    return '🔒 System locked. All sessions paused.';
  }

  async handleUnlock(_args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can unlock the system';
    }

    for (const userSession of this.accessController.sessions.values()) {
      userSession.locked = false;
      userSession.lastActivity = Date.now();
    }

    return '🔓 System unlocked.';
  }

  async handleHelp() {
    return `📖 OpenCode Remote Help

You can talk naturally:
• "review my staged changes and suggest a commit message"
• "what failed in tests and how do we fix it?"

Quick start:
• /status — service + transport health
• /help — show this menu
• /session new [title] — start a fresh session

Common commands:
• /pwd — show current working directory
• /cd <path> — change working directory
• /ls [path] — list files
• /find <pattern> — find files by name
• /grep <pattern> — search text in files
• /projects — list known projects
• /project use <id> — switch workspace to project
• /session list — list sessions
• /session status [id] — show session status
• /session use <id> — set active session
• /session abort <id> — abort specific session
• /diff [sessionId] — summarize changes
• /summarize [sessionId] — summarize session context

Execution:
• /abort — stop active run(s)
• /confirm <id> — confirm dangerous action
• /permission <permissionId> <once|always|reject> — permission response
• /last — fetch latest run output

OpenCode advanced:
• /model status | /model list [provider] [full] | /model set <provider> <model>
• /tools ids | /tools list [provider] [model]
• /mcp status | /mcp add <name> <command> | /mcp connect <server> | /mcp disconnect <server>
• /skills list
• /opencode status | /opencode providers | /opencode commands | /opencode diagnostics

Admin (owner only):
• /users list | /users add <number> | /users remove <number>
• /users bindtg <telegramUserId> <number> [username]
• /users unbindtg <telegramUserId> | /users tglist
• /lock | /unlock`;
  }

  formatPendingConfirmation(confirmId: string, command: string): string {
    return `⚠️ This action (${command}) requires confirmation.\n\nConfirmation ID: \`${confirmId}\`\n\nReply with:\n/confirm ${confirmId}\n\nThis confirmation expires in 5 minutes.`;
  }

  formatError(message: string): string {
    return `❌ Error: ${message}`;
  }
}
