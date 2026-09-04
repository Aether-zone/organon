import type { LogLevel } from './log-level.js';

export const LOGGER_OPTIONS = 'ORGANON_LOGGER_OPTIONS';

export interface LoggerOptions {
  /** Quietest level to emit. Defaults to `log` in production, `debug` elsewhere. */
  level?: LogLevel;
  /** Written to every record — a service name, a version, a deployment. */
  base?: Record<string, unknown>;
  /**
   * Header carrying the request id, in and out. Defaults to `x-request-id`.
   */
  requestIdHeader?: string;
  /**
   * Whether an inbound request id is honoured rather than replaced.
   *
   * Defaults to **false**. Behind a gateway that sets the header this should
   * be on, and is what makes one id span several services. Exposed directly to
   * the internet it should stay off: an id a caller chooses is an id a caller
   * can repeat, which lets them collide their requests with someone else's in
   * your logs.
   */
  trustInboundRequestId?: boolean;
  /** Log a line per request. Defaults to true. */
  logRequests?: boolean;
  /** Paths never logged as requests — health checks, mostly. */
  ignorePaths?: readonly string[];
}

export interface ResolvedLoggerOptions extends LoggerOptions {
  requestIdHeader: string;
  trustInboundRequestId: boolean;
  logRequests: boolean;
  ignorePaths: readonly string[];
}

export const withLoggerDefaults = (
  options: LoggerOptions = {},
): ResolvedLoggerOptions => ({
  ...options,
  requestIdHeader: options.requestIdHeader ?? 'x-request-id',
  trustInboundRequestId: options.trustInboundRequestId ?? false,
  logRequests: options.logRequests ?? true,
  ignorePaths: options.ignorePaths ?? [],
});
