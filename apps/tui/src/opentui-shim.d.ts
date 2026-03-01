declare module '@opentui/core' {
  export interface KeyEvent {
    name?: string;
    sequence?: string;
    ctrl?: boolean;
    meta?: boolean;
  }

  export class TextRenderable {
    constructor(renderer: unknown, options: { id: string; content: string; selectable?: boolean });
    content: string;
  }

  export function createCliRenderer(options?: { exitOnCtrlC?: boolean }): Promise<{
    root: { add: (renderable: unknown) => void };
    keyInput: { on: (event: 'keypress', handler: (key: KeyEvent) => void) => void };
  }>;
}
