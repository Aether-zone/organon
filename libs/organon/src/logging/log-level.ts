import type { LogLevel as NestLogLevel } from '@nestjs/common';

/**
 * The levels Nest emits, ordered by severity.
 *
 * Nest's own `LogLevel` is a union with no ordering, so a threshold cannot be
 * expressed against it. This is that ordering, and nothing more — the names
 * are Nest's.
 */
export const LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const satisfies readonly NestLogLevel[];

export type LogLevel = (typeof LOG_LEVELS)[number];

const SEVERITY: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** True when `level` is at least as severe as `threshold`. */
export const isAtLeast = (level: LogLevel, threshold: LogLevel): boolean =>
  SEVERITY[level] >= SEVERITY[threshold];
