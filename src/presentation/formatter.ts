/**
 * Presentation formatter for user-facing chat responses.
 */
export class MessageFormatter {
  /**
   * Build standard section header with current local time.
   */
  header(mode: string): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `OpenCode Remote - ${mode} - ${hh}:${mm}`;
  }

  /**
   * Format prompt execution output.
   */
  formatPromptResult({ sessionId, response }: { sessionId: string; messageId: string; response: string }) {
    const cleaned = this.cleanPromptOutput(response || '(no response)');
    const body = this.truncateText(cleaned, {
      maxLines: 80,
      maxChars: 4000,
    });

    return [
      `Session: ${sessionId}`,
      '',
      body,
    ].join('\n');
  }

  /**
   * Format shell command output with duration metadata.
   */
  formatShellResult({ command, output, durationMs }: { command: string; output: string; durationMs: number }) {
    const body = this.truncateText(output || '(no output)', {
      maxLines: 80,
      maxChars: 4000,
    });
    const seconds = (durationMs / 1000).toFixed(1);

    return [
      'Shell - Command completed',
      '',
      `Command: ${command}`,
      `Duration: ${seconds}s`,
      '',
      body,
    ].join('\n');
  }

  /**
   * Format file read content for chat delivery.
   */
  formatFileReadResult({ path, content }: { path: string; content: string }) {
    const body = this.truncateText(content || '(empty file)', {
      maxLines: 100,
      maxChars: 4000,
    });
    return [
      'File Read',
      '',
      `Path: ${path}`,
      '',
      body,
    ].join('\n');
  }

  /**
   * Format OpenCode session list summary.
   */
  formatSessionList(sessions: Array<{ id?: string; title?: string; status?: string }> | null | undefined) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return 'Sessions - No sessions found.';
    }

    const lines = sessions.slice(0, 20).map((session) => {
      const title = session.title || '(untitled)';
      const status = session.status || 'unknown';
      return `- ${session.id}: ${title} (${status})`;
    });

    return [
      `Sessions (${sessions.length} found)`,
      '',
      ...lines,
      '',
      'Tip: use /session abort <id> to stop one.',
    ].join('\n');
  }

  /**
   * Format OpenCode session status details.
   */
  formatSessionStatus(status: { state?: string; status?: string; mode?: string; running?: boolean; id?: string } | null | undefined, sessionId: string | null | undefined) {
    if (!status) {
      return 'Session Status - No session status available.';
    }

    const state = status.state || status.status || 'unknown';
    const mode = status.mode || 'default';
    const running = status.running ? 'yes' : 'no';

    return [
      'Session Status',
      '',
      `Session: ${sessionId || status.id || '(unknown)'}`,
      `State: ${state}`,
      `Mode: ${mode}`,
      `Running: ${running}`,
    ].join('\n');
  }

  /**
   * Format file listing results.
   */
  formatFileList(items: Array<{ name?: string; path?: string; type?: string; dir?: boolean }> | null | undefined, basePath = '.') {
    if (!Array.isArray(items) || items.length === 0) {
      return `List Files - No files under ${basePath}.`;
    }

    const lines = items.slice(0, 80).map((item) => {
      const name = item.name || item.path || '(unknown)';
      const isDir = item.type === 'directory' || item.dir === true;
      return `- ${isDir ? '[dir]' : '[file]'} ${name}`;
    });

    return [
      `List Files - ${basePath}`,
      '',
      ...lines,
      items.length > 80 ? `... and ${items.length - 80} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Format file search results by name/glob query.
   */
  formatFindFilesResult(query: string, items: string[] | null | undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return `Find Files - No files matched ${query}.`;
    }

    const lines = items.slice(0, 80).map((item) => `- ${item}`);
    return [
      `Find Files - ${query}`,
      '',
      `Matches: ${items.length}`,
      '',
      ...lines,
      items.length > 80 ? `... and ${items.length - 80} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Format text-search matches with file and line metadata.
   */
  formatFindTextResult(
    pattern: string,
    matches:
      | Array<{ path?: { text?: string }; line_number?: number; lines?: { text?: string } }>
      | null
      | undefined,
  ) {
    if (!Array.isArray(matches) || matches.length === 0) {
      return `Find Text - No text matched ${pattern}.`;
    }

    const lines = matches.slice(0, 50).map((match) => {
      const file = match?.path?.text || '(unknown file)';
      const line = match?.line_number || '?';
      const text = (match?.lines?.text || '').trim();
      return `- ${file}:${line}: ${text}`;
    });

    return [
      `Find Text - ${pattern}`,
      '',
      `Matches: ${matches.length}`,
      '',
      ...lines,
      matches.length > 50 ? `... and ${matches.length - 50} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Format diff summary across changed files.
   */
  formatDiffResult(diff: Array<{ path?: string; file?: string; additions?: number; deletions?: number }> | null | undefined) {
    if (!Array.isArray(diff) || diff.length === 0) {
      return 'Diff - No changes found.';
    }

    const preview = diff.slice(0, 20).map((entry) => {
      const file = entry?.path || entry?.file || '(unknown file)';
      const additions = entry?.additions ?? '?';
      const deletions = entry?.deletions ?? '?';
      return `- ${file} (+${additions} / -${deletions})`;
    });

    return [
      `Diff - ${diff.length} files changed`,
      '',
      ...preview,
    ].join('\n');
  }

  /**
   * Format one-line success response.
   */
  formatSuccess(mode: string, text: string): string {
    return `${mode} - ${text}`;
  }

  /**
   * Format a single stored run lookup response.
   */
  formatRunLookup(item: { id: string; commandType: string; createdAt: number; raw: string } | null) {
    if (!item) {
      return 'Run Lookup - Run ID not found.';
    }

    const created = new Date(item.createdAt);
    const hh = String(created.getHours()).padStart(2, '0');
    const mm = String(created.getMinutes()).padStart(2, '0');
    const raw = this.truncateText(item.raw, {
      maxLines: 150,
      maxChars: 4000,
    });

    return [
      'Run Lookup',
      '',
      `ID: ${item.id}`,
      `Type: ${item.commandType}`,
      `Created: ${hh}:${mm}`,
      '',
      raw,
    ].join('\n');
  }

  /**
   * Format recent run-id list for quick retrieval.
   */
  formatRunList(items: Array<{ id: string; commandType: string; createdAt: number }> | null | undefined) {
    if (!items || items.length === 0) {
      return 'Runs - No recent runs found.';
    }

    const lines = items.map((item) => {
      const created = new Date(item.createdAt);
      const hh = String(created.getHours()).padStart(2, '0');
      const mm = String(created.getMinutes()).padStart(2, '0');
      return `- ${item.id}: ${item.commandType} at ${hh}:${mm}`;
    });

    return [
      'Runs',
      '',
      'Recent run IDs',
      ...lines,
      '',
      'Use /last to fetch the latest run output.',
    ].join('\n');
  }

  /**
   * Format one-line warning response.
   */
  formatWarning(mode: string, text: string): string {
    return `${mode} - ${text}`;
  }

  /**
   * Format permission prompt response instructions.
   */
  formatPermissionRequest(permission: { id?: string; title?: string; type?: string; sessionID?: string } | null | undefined) {
    const id = permission?.id || '(unknown)';
    const title = permission?.title || 'Permission request';
    const type = permission?.type || 'unknown';
    const sessionID = permission?.sessionID || '(none)';

    return [
      'Permission Request',
      '',
      title,
      `Permission: ${id}`,
      `Session: ${sessionID}`,
      `Type: ${type}`,
      '',
      'Reply with:',
      `- /allow ${id}`,
      `- /permission ${id} always`,
      `- /deny ${id}`,
    ].join('\n');
  }

  /**
   * Format standardized error response with recovery hints.
   */
  formatError(mode: string, text: string): string {
    return [
      `${mode} - Command failed`,
      '',
      text,
      '',
      'Try:',
      '1) /status',
      '2) /help',
    ].join('\n');
  }

  /**
   * Clamp text payload by line and character limits.
   */
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
