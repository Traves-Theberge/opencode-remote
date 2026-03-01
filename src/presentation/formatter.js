export class MessageFormatter {
  header(mode) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `🟢 OpenCode Remote · ${mode} · ${hh}:${mm}`;
  }

  formatPromptResult({ sessionId, messageId, response }) {
    const body = this.truncateText(response || '(no response)', {
      maxLines: 40,
      maxChars: 2600,
    });

    return [
      this.header('Prompt'),
      '',
      '✅ Response ready',
      `🧵 Session: \`${sessionId}\``,
      `✉️ Message: \`${messageId}\``,
      '',
      body,
      '',
      'Next',
      '1) `@oc continue with this task`',
      '2) `@oc /diff`',
      '3) `@oc /summarize`',
    ].join('\n');
  }

  formatShellResult({ command, output, durationMs }) {
    const body = this.truncateText(output || '(no output)', {
      maxLines: 36,
      maxChars: 2200,
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
      '1) `@oc /diff`',
      '2) `@oc /run <another command>`',
      '3) `@oc explain this output and what to fix`',
    ].join('\n');
  }

  formatFileReadResult({ path, content }) {
    const body = this.truncateText(content || '(empty file)', {
      maxLines: 45,
      maxChars: 2800,
    });
    return [
      this.header('File Read'),
      '',
      `📄 Path: \`${path}\``,
      '',
      body,
    ].join('\n');
  }

  formatSessionList(sessions) {
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
      'Tip: use `@oc /session abort <id>` to stop one.',
    ].join('\n');
  }

  formatSessionStatus(status, sessionId) {
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

  formatFileList(items, basePath = '.') {
    if (!Array.isArray(items) || items.length === 0) {
      return [this.header('List Files'), '', `📂 No files under \`${basePath}\`.`].join('\n');
    }

    const lines = items.slice(0, 40).map((item) => {
      const name = item.name || item.path || '(unknown)';
      const isDir = item.type === 'directory' || item.dir === true;
      return `• ${isDir ? '📁' : '📄'} ${name}`;
    });

    return [
      this.header('List Files'),
      '',
      `📂 Path: \`${basePath}\``,
      ...lines,
      '',
      items.length > 40 ? '… output trimmed for WhatsApp readability' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatFindFilesResult(query, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return [this.header('Find Files'), '', `🔍 No files matched \`${query}\`.`].join('\n');
    }

    const lines = items.slice(0, 40).map((item) => `• ${item}`);
    return [
      this.header('Find Files'),
      '',
      `🔍 Query: \`${query}\``,
      `✅ Matches: ${items.length}`,
      ...lines,
      '',
      items.length > 40 ? '… output trimmed for WhatsApp readability' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatFindTextResult(pattern, matches) {
    if (!Array.isArray(matches) || matches.length === 0) {
      return [this.header('Find Text'), '', `🔎 No text matched \`${pattern}\`.`].join('\n');
    }

    const lines = matches.slice(0, 25).map((match) => {
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
      '',
      matches.length > 25 ? '… output trimmed for WhatsApp readability' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatDiffResult(diff) {
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
      '1) `@oc summarize these changes`',
      '2) `@oc review these changes for risks`',
    ].join('\n');
  }

  formatSuccess(mode, text) {
    return [this.header(mode), '', `✅ ${text}`].join('\n');
  }

  formatWithRunId(text, runId) {
    if (!runId) {
      return text;
    }

    return [text, '', `🆔 Run: \`${runId}\``, 'Use `@oc /get <runId>` for full output.'].join('\n');
  }

  formatRunLookup(item) {
    if (!item) {
      return [this.header('Run Lookup'), '', '❌ Run ID not found.'].join('\n');
    }

    const created = new Date(item.createdAt);
    const hh = String(created.getHours()).padStart(2, '0');
    const mm = String(created.getMinutes()).padStart(2, '0');
    const raw = this.truncateText(item.raw, {
      maxLines: 80,
      maxChars: 5000,
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

  formatRunList(items) {
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
      'Use `@oc /get <runId>` to fetch one.',
    ].join('\n');
  }

  formatWarning(mode, text) {
    return [this.header(mode), '', `⚠️ ${text}`].join('\n');
  }

  formatPermissionRequest(permission) {
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
      `• \`@oc /allow ${id}\``,
      `• \`@oc /permission ${id} always\``,
      `• \`@oc /deny ${id}\``,
    ].join('\n');
  }

  formatError(mode, text) {
    return [
      this.header(mode),
      '',
      '❌ Command failed',
      text,
      '',
      'Try',
      '1) `@oc /status`',
      '2) `@oc /help`',
    ].join('\n');
  }

  truncateText(text, { maxLines = 40, maxChars = 2400 } = {}) {
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
      clipped += '\n\n… output trimmed for WhatsApp readability';
    }

    return clipped;
  }
}
