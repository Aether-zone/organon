import type { LoggerService } from '@nestjs/common';

import { currentRequestId } from './request-context.js';
import { isAtLeast, type LogLevel } from './log-level.js';

/** One log line. Extension fields sit alongside these. */
export interface LogRecord {
  level: LogLevel;
  time: string;
  message: string;
  context?: string;
  requestId?: string;
  stack?: string;
  [field: string]: unknown;
}

export interface JsonLoggerOptions {
  /** Quietest level to emit. Defaults to `log`, or `debug` outside production. */
  level?: LogLevel;
  /** Written to every record — a service name, a version, a deployment. */
  base?: Record<string, unknown>;
  /** Where a record goes. Overridable so a test can capture it. */
  write?: (record: LogRecord, line: string) => void;
}

/**
 * A `LoggerService` that writes one JSON object per line.
 *
 * Nest's own logger renders for a human reading a terminal. This one renders
 * for a log aggregator: every record is a single line of JSON, so a multi-line
 * stack trace cannot be mistaken for several records, and fields can be
 * searched rather than pattern-matched out of prose.
 *
 * Records carry the current `requestId` automatically when one is in scope —
 * see `RequestContextMiddleware`. That is the point of the whole arrangement:
 * a log written deep inside a service is tied to the request that caused it
 * without anything having to be threaded through the call stack.
 *
 * Errors and fatals go to stderr, everything else to stdout, which is what a
 * container runtime expects.
 */
export class JsonLogger implements LoggerService {
  private readonly threshold: LogLevel;
  private readonly base: Record<string, unknown>;
  private readonly write: (record: LogRecord, line: string) => void;

  constructor(options: JsonLoggerOptions = {}) {
    this.threshold =
      options.level ??
      (process.env.NODE_ENV === 'production' ? 'log' : 'debug');
    this.base = options.base ?? {};
    this.write = options.write ?? defaultWrite;
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.emit('log', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.emit('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.emit('verbose', message, rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.emit('fatal', message, rest);
  }

  /**
   * Nest calls this as `error(message, stack?, context?)`, and with only one
   * trailing argument there is nothing in the signature to say which it is.
   * A newline decides it: a stack has them, a context — a class name — does
   * not.
   */
  error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }

  private emit(level: LogLevel, message: unknown, rest: unknown[]): void {
    if (!isAtLeast(level, this.threshold)) {
      return;
    }

    const { context, stack } = readTrailing(rest);
    const { text, fields } = readMessage(message);

    const record: LogRecord = {
      ...this.base,
      ...fields,
      level,
      time: new Date().toISOString(),
      message: text,
      ...(context === undefined ? {} : { context }),
      ...(stack === undefined ? {} : { stack }),
    };

    const requestId = currentRequestId();

    if (requestId !== undefined) {
      record.requestId = requestId;
    }

    this.write(record, safeStringify(record));
  }
}

/**
 * Splits Nest's trailing arguments into a context and a stack. Anything that
 * is not a string is ignored rather than guessed at.
 */
function readTrailing(rest: unknown[]): {
  context?: string;
  stack?: string;
} {
  const strings = rest.filter(
    (entry): entry is string => typeof entry === 'string',
  );

  if (strings.length === 0) {
    return {};
  }

  if (strings.length === 1) {
    const only = strings[0];

    return only.includes('\n') ? { stack: only } : { context: only };
  }

  // Nest's own order is (stack, context).
  return { stack: strings[0], context: strings[strings.length - 1] };
}

/**
 * A message may be a string, an `Error`, or an object carrying a `message`
 * alongside fields worth having as columns rather than buried in prose.
 */
function readMessage(message: unknown): {
  text: string;
  fields: Record<string, unknown>;
} {
  if (typeof message === 'string') {
    return { text: message, fields: {} };
  }

  if (message instanceof Error) {
    return {
      text: message.message,
      fields: message.stack === undefined ? {} : { stack: message.stack },
    };
  }

  if (message !== null && typeof message === 'object') {
    const { message: text, ...fields } = message as Record<string, unknown>;

    return {
      text: typeof text === 'string' ? text : JSON.stringify(message),
      fields: typeof text === 'string' ? fields : {},
    };
  }

  return { text: String(message), fields: {} };
}

/**
 * A record that cannot be serialised must not take the process down, and must
 * not vanish either — a circular reference in a logged object is a mistake
 * worth seeing rather than a reason to lose the line.
 */
function safeStringify(record: LogRecord): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({
      level: record.level,
      time: record.time,
      message: record.message,
      context: record.context,
      logError: 'This record could not be serialised.',
    });
  }
}

function defaultWrite(record: LogRecord, line: string): void {
  const stream =
    record.level === 'error' || record.level === 'fatal'
      ? process.stderr
      : process.stdout;

  stream.write(`${line}\n`);
}
