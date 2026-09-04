/** Whether one dependency is usable. */
export type HealthStatus = 'up' | 'down';

/** The outcome of one check. Anything else on it is reported as-is. */
export interface HealthCheckResult {
  status: HealthStatus;
  /** Why it is down, or anything worth seeing while it is up. */
  [detail: string]: unknown;
}

/**
 * Something whose health can be asked about — a database, a bucket, a queue.
 *
 * Implementations should be cheap and should not retry: a health check is
 * asked often, and an orchestrator's own interval is the retry.
 */
export interface HealthIndicator {
  /** Key this check appears under in the report. */
  readonly name: string;
  check(): Promise<HealthCheckResult> | HealthCheckResult;
}

/** Resolves to every registered {@link HealthIndicator}. */
export const HEALTH_INDICATORS = 'ORGANON_HEALTH_INDICATORS';

/** What the endpoints return. */
export interface HealthReport {
  status: HealthStatus;
  /** Seconds the process has been up. */
  uptime: number;
  /** Whatever `info` the module was configured with — a version, a name. */
  info?: Record<string, unknown>;
  /** One entry per indicator, keyed by its name. */
  checks: Record<string, HealthCheckResult>;
}
