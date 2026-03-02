import pino from 'pino';

/** Shared structured logger for daemon/runtime modules. */
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    bindings: (bindings) => ({
      service: 'opencode-remote',
      ...bindings,
    }),
  },
});

export { logger };
