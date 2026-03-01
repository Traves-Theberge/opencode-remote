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
  prompt: 'elevated',
  run: 'dangerous',
  shell: 'dangerous',
  'session abort': 'dangerous',
  abort: 'dangerous',
};

export class CommandRouter {
  accessController: AccessControllerLike;

  constructor(accessController: AccessControllerLike) {
    this.accessController = accessController;
  }

  async parse(rawMessage: string): Promise<ParsedCommand | null> {
    const text = rawMessage.trim();
    if (!text.toLowerCase().startsWith('@oc')) {
      return null;
    }

    const content = this.stripAlias(text);
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

    switch (base) {
      case 'help':
        return this.toParsed('help', []);
      case 'status':
        return this.toParsed('status', []);
      case 'get':
        return this.toParsed('output get', [rest[0] || '']);
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
      case 'run':
        return this.toParsed('run', [rest.join(' ')]);
      case 'shell':
        return this.toParsed('shell', [rest.join(' ')]);
      case 'prompt':
        return this.toParsed('prompt', [rest.join(' ')]);
      case 'users':
        return this.parseUsers(rest);
      case 'session':
        return this.parseSession(rest);
      case 'diff':
        return this.toParsed('diff', [rest[0]].filter(Boolean));
      case 'summarize':
      case 'summary':
        return this.toParsed('summarize', [rest[0]].filter(Boolean));
      default:
        return this.toParsed('prompt', [line]);
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
    return {
      command,
      tier: COMMAND_TIERS[command] || 'safe',
      args,
      raw: [command, ...args].join(' '),
    };
  }

  stripAlias(text: string): string {
    const parts = text.split(/\s+/);
    if (parts[0].toLowerCase() !== '@oc') {
      return '';
    }
    return text.slice(parts[0].length).trim();
  }

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

    return handler(args, session, context);
  }

  getHandler(command: string) {
    const handlers = {
      status: this.handleStatus.bind(this),
      help: this.handleHelp.bind(this),
      prompt: this.handlePrompt.bind(this),
      run: this.handleRun.bind(this),
      shell: this.handleShell.bind(this),
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

    return handlers[command];
  }

  async handleStatus() {
    return { type: 'status' };
  }

  async handlePrompt(args: string[]) {
    return { type: 'prompt', text: args.join(' ').trim() };
  }

  async handleRun(args: string[]) {
    return { type: 'run', command: args.join(' ').trim() };
  }

  async handleShell(args: string[]) {
    return { type: 'shell', command: args.join(' ').trim() };
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

  async handleConfirm(args: string[], session: SessionState) {
    const confirmId = String(args[0] || '').toUpperCase();
    const result = this.accessController.verifyConfirm(confirmId, session);

    if (!result.valid) {
      return `❌ ${result.error}`;
    }

    const { type, args: actionArgs, context } = result.action;
    const handler = this.getHandler(type);
    if (!handler) {
      return this.formatError(`Unknown command: ${type}`);
    }

    session.confirmed = true;
    try {
      return await handler(actionArgs, session, context);
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
      return '❌ Missing phone number. Example: @oc /users add +15551234567';
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
      return '❌ Missing phone number. Example: @oc /users remove +15551234567';
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
      return '❌ Missing or invalid Telegram user ID. Example: @oc /users bindtg 123456789 +15551234567 alice';
    }
    if (!phone) {
      return '❌ Missing phone number. Example: @oc /users bindtg 123456789 +15551234567 alice';
    }

    try {
      this.accessController.bindTelegramUser(phone, telegramUserId, username || null, session.phoneNumber);
      return `✅ Bound Telegram user ${telegramUserId} to ${phone}`;
    } catch (error) {
      return `❌ ${error?.message || 'Failed to bind Telegram user'}`;
    }
  }

  async handleUsersUnbindTelegram(args: string[], session: SessionState) {
    if (!this.accessController.isOwner(session.phoneNumber)) {
      return '❌ Only the owner can unbind Telegram users';
    }

    const telegramUserId = String(args[0] || '').trim();
    if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
      return '❌ Missing or invalid Telegram user ID. Example: @oc /users unbindtg 123456789';
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
    return `📖 OpenCode Remote

Default behavior:
• Any @oc message is forwarded to OpenCode as-is.
• Example: @oc review my staged changes and propose a commit message

Control commands (slash):
• @oc /status
• @oc /pwd
• @oc /cd <path>
• @oc /ls [path]
• @oc /find <pattern>
• @oc /grep <pattern>
• @oc /projects
• @oc /project use <id>
• @oc /session list
• @oc /session status [id]
• @oc /session use <id>
• @oc /session new [title]
• @oc /session abort <id>
• @oc /diff [sessionId]
• @oc /summarize [sessionId]
• @oc /run <command>
• @oc /shell <command>
• @oc /abort
• @oc /confirm <id>
• @oc /permission <permissionId> <once|always|reject>
• @oc /runs
• @oc /get <runId>

Admin:
• @oc /users list
• @oc /users add <number>
• @oc /users remove <number>
• @oc /users bindtg <telegramUserId> <number> [username]
• @oc /users unbindtg <telegramUserId>
• @oc /users tglist
• @oc /lock
• @oc /unlock`;
  }

  formatPendingConfirmation(confirmId: string, command: string): string {
    return `⚠️ This action (${command}) requires confirmation.\n\nConfirmation ID: \`${confirmId}\`\n\nReply with:\n@oc /confirm ${confirmId}\n\nThis confirmation expires in 5 minutes.`;
  }

  formatError(message: string): string {
    return `❌ Error: ${message}`;
  }
}
