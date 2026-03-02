export class MessageFormatter {
  header(mode: string): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `🟢 OpenCode Remote · ${mode} · ${hh}:${mm}`;
  }

  formatPromptResult({ sessionId, messageId, response }: { sessionId: string; messageId: string; response: string }) {
    const cleaned = this.cleanPromptOutput(response || '(no response)');
    const body = this.truncateText(cleaned, {
      maxLines: 80,
      maxChars: 4000,
    });

    return [
      this.header('Response'),
      '',
      '✅ Done',
      `🧵 Session: \`${sessionId}\``,
      `✉️ Ref: \`${messageId}\``,
      '',
      body,
      '',
      'Next',
      '1) `continue with this task`',
      '2) `/diff`',
      '3) `/summarize`',
    ].join('\n');
  }

  formatShellResult({ command, output, durationMs }: { command: string; output: string; durationMs: number }) {
    const body = this.truncateText(output || '(no output)', {
      maxLines: 80,
      maxChars: 4000,
    });
    const seconds = (durationMs / 1000).toFixed(1);

    return [
      this.header('Shell'),
      '',
      '✅ Command completed',
      `💻 Command: \`${command}\``,
      `⏱ Duration: ${seconds}s`,
      '',
      body,
      '',
      'Next',
      '1) `/diff`',
      '2) `/run <another command>`',
      '3) `explain this output and what to fix`',
    ].join('\n');
  }

  formatFileReadResult({ path, content }: { path: string; content: string }) {
    const body = this.truncateText(content || '(empty file)', {
      maxLines: 100,
      maxChars: 4000,
    });
    return [
      this.header('File Read'),
      '',
      `📄 Path: \`${path}\``,
      '',
      body,
    ].join('\n');
  }

  formatSessionList(sessions: Array<{ id?: string; title?: string; status?: string }> | null | undefined) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return [this.header('Sessions'), '', '📚 No sessions found.'].join('\n');
    }

    const lines = sessions.slice(0, 20).map((session) => {
      const title = session.title || '(untitled)';
      const status = session.status || 'unknown';
      return `• \`${session.id}\` · ${title} · ${status}`;
    });

    return [
      this.header('Sessions'),
      '',
      `📚 Found ${sessions.length} session(s)`,
      ...lines,
      '',
      'Tip: use `/session abort <id>` to stop one.',
    ].join('\n');
  }

  formatSessionStatus(status: { state?: string; status?: string; mode?: string; running?: boolean; id?: string } | null | undefined, sessionId: string | null | undefined) {
    if (!status) {
      return [this.header('Session Status'), '', 'ℹ️ No session status available.'].join('\n');
    }

    const state = status.state || status.status || 'unknown';
    const mode = status.mode || 'default';
    const running = status.running ? 'yes' : 'no';

    return [
      this.header('Session Status'),
      '',
      `🧵 Session: \`${sessionId || status.id || '(unknown)'}\``,
      `📌 State: ${state}`,
      `⚙️ Mode: ${mode}`,
      `🏃 Running: ${running}`,
    ].join('\n');
  }

  formatFileList(items: Array<{ name?: string; path?: string; type?: string; dir?: boolean }> | null | undefined, basePath = '.') {
    if (!Array.isArray(items) || items.length === 0) {
      return [this.header('List Files'), '', `📂 No files under \`${basePath}\`.`].join('\n');
    }

    const lines = items.slice(0, 80).map((item) => {
      const name = item.name || item.path || '(unknown)';
      const isDir = item.type === 'directory' || item.dir === true;
      return `• ${isDir ? '📁' : '📄'} ${name}`;
    });

    return [
      this.header('List Files'),
      '',
      `📂 Path: \`${basePath}\``,
      ...lines,
      items.length > 80 ? `… and ${items.length - 80} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatFindFilesResult(query: string, items: string[] | null | undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return [this.header('Find Files'), '', `🔍 No files matched \`${query}\`.`].join('\n');
    }

    const lines = items.slice(0, 80).map((item) => `• ${item}`);
    return [
      this.header('Find Files'),
      '',
      `🔍 Query: \`${query}\``,
      `✅ Matches: ${items.length}`,
      ...lines,
      items.length > 80 ? `… and ${items.length - 80} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatFindTextResult(
    pattern: string,
    matches:
      | Array<{ path?: { text?: string }; line_number?: number; lines?: { text?: string } }>
      | null
      | undefined,
  ) {
    if (!Array.isArray(matches) || matches.length === 0) {
      return [this.header('Find Text'), '', `🔎 No text matched \`${pattern}\`.`].join('\n');
    }

    const lines = matches.slice(0, 50).map((match) => {
      const file = match?.path?.text || '(unknown file)';
      const line = match?.line_number || '?';
      const text = (match?.lines?.text || '').trim();
      return `• ${file}:${line} — ${text}`;
    });

    return [
      this.header('Find Text'),
      '',
      `🔎 Pattern: \`${pattern}\``,
      `✅ Matches: ${matches.length}`,
      ...lines,
      matches.length > 50 ? `… and ${matches.length - 50} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatDiffResult(diff: Array<{ path?: string; file?: string; additions?: number; deletions?: number }> | null | undefined) {
    if (!Array.isArray(diff) || diff.length === 0) {
      return [this.header('Diff'), '', '🧩 No diffs found.'].join('\n');
    }

    const preview = diff.slice(0, 20).map((entry) => {
      const file = entry?.path || entry?.file || '(unknown file)';
      const additions = entry?.additions ?? '?';
      const deletions = entry?.deletions ?? '?';
      return `• ${file} (+${additions} / -${deletions})`;
    });

    return [
      this.header('Diff'),
      '',
      `🧩 Files changed: ${diff.length}`,
      ...preview,
      '',
      'Next',
      '1) `summarize these changes`',
      '2) `review these changes for risks`',
    ].join('\n');
  }

  formatSuccess(mode: string, text: string): string {
    return [this.header(mode), '', `✅ ${text}`].join('\n');
  }

  formatWithRunId(text: string, runId: string | null): string {
    if (!runId) {
      return text;
    }

    return [text, '', `🆔 Run: \`${runId}\``, 'Use `/get <runId>` for full output.'].join('\n');
  }

  formatRunLookup(item: { id: string; commandType: string; createdAt: number; raw: string } | null) {
    if (!item) {
      return [this.header('Run Lookup'), '', '❌ Run ID not found.'].join('\n');
    }

    const created = new Date(item.createdAt);
    const hh = String(created.getHours()).padStart(2, '0');
    const mm = String(created.getMinutes()).padStart(2, '0');
    const raw = this.truncateText(item.raw, {
      maxLines: 150,
      maxChars: 4000,
    });

    return [
      this.header('Run Lookup'),
      '',
      `🆔 Run: \`${item.id}\``,
      `🧭 Type: ${item.commandType}`,
      `🕒 Created: ${hh}:${mm}`,
      '',
      raw,
    ].join('\n');
  }

  formatRunList(items: Array<{ id: string; commandType: string; createdAt: number }> | null | undefined) {
    if (!items || items.length === 0) {
      return [this.header('Runs'), '', 'ℹ️ No recent runs found.'].join('\n');
    }

    const lines = items.map((item) => {
      const created = new Date(item.createdAt);
      const hh = String(created.getHours()).padStart(2, '0');
      const mm = String(created.getMinutes()).padStart(2, '0');
      return `• \`${item.id}\` · ${item.commandType} · ${hh}:${mm}`;
    });

    return [
      this.header('Runs'),
      '',
      'Recent run IDs',
      ...lines,
      '',
      'Use `/get <runId>` to fetch one.',
    ].join('\n');
  }

  formatWarning(mode: string, text: string): string {
    return [this.header(mode), '', `⚠️ ${text}`].join('\n');
  }

  formatPermissionRequest(permission: { id?: string; title?: string; type?: string; sessionID?: string } | null | undefined) {
    const id = permission?.id || '(unknown)';
    const title = permission?.title || 'Permission request';
    const type = permission?.type || 'unknown';
    const sessionID = permission?.sessionID || '(none)';

    return [
      this.header('Permission'),
      '',
      `⚠️ ${title}`,
      `🆔 Permission: \`${id}\``,
      `🧵 Session: \`${sessionID}\``,
      `🏷 Type: ${type}`,
      '',
      'Reply with:',
      `• \`/allow ${id}\``,
      `• \`/permission ${id} always\``,
      `• \`/deny ${id}\``,
    ].join('\n');
  }

  formatError(mode: string, text: string): string {
    return [
      this.header(mode),
      '',
      '❌ Command failed',
      text,
      '',
      'Try',
      '1) `/status`',
      '2) `/help`',
    ].join('\n');
  }

  truncateText(text: string, { maxLines = 80, maxChars = 4000 }: { maxLines?: number; maxChars?: number } = {}) {
    const normalized = String(text || '').trim();
    if (!normalized) {
      return '(no output)';
    }

    let clipped = normalized;
    let truncated = false;

    if (clipped.length > maxChars) {
      clipped = clipped.slice(0, maxChars);
      truncated = true;
    }

    const lines = clipped.split('\n');
    if (lines.length > maxLines) {
      clipped = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }

    if (truncated) {
      clipped += '\n\n… (output truncated)';
    }

    return clipped;
  }

  /**
   * Remove raw SDK event-envelope lines from prompt output before chat rendering.
   */
  cleanPromptOutput(text: string): string {
    const lines = String(text || '')
      .split('\n')
      .map((line) => line.trimEnd());
    const filtered = lines.filter((line) => !this.isOpencodeEventLine(line));
    const normalized = filtered.join('\n').trim();
    return normalized || '(no response)';
  }

  /**
   * Detect JSON-encoded OpenCode event lines that should not be shown to end users.
   */
  isOpencodeEventLine(line: string): boolean {
    const trimmed = String(line || '').trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return false;
    }

    try {
      const parsed = JSON.parse(trimmed) as { type?: string };
      if (!parsed || typeof parsed.type !== 'string') {
        return false;
      }

      return [
        'step-start',
        'step-finish',
        'reasoning',
        'tool-call',
        'tool-result',
        'assistant-message',
      ].includes(parsed.type);
    } catch {
      return false;
    }
  }
}
