import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  HEALTH_INDICATORS,
  type HealthCheckResult,
  type HealthIndicator,
  type HealthReport,
} from './health-indicator.js';
import {
  HEALTH_OPTIONS,
  type ResolvedHealthOptions,
} from './health.options.js';

/**
 * Runs the registered indicators and assembles a report.
 *
 * Two rules make this safe to expose to an orchestrator:
 *
 * - **Every indicator is bounded by a timeout.** A check that hangs — a socket
 *   opened to a database that has stopped answering, most often — would
 *   otherwise hang the health endpoint, and a health endpoint that never
 *   answers reads as a *liveness* failure. The process then gets restarted for
 *   a fault in something it merely talks to.
 * - **An indicator that throws is reported, not propagated.** One broken check
 *   marks itself down and leaves the rest of the report intact, which is the
 *   difference between "the cache is down" and "health is broken".
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_OPTIONS)
    private readonly options: ResolvedHealthOptions,
    @Optional()
    @Inject(HEALTH_INDICATORS)
    private readonly indicators: HealthIndicator[] = [],
  ) {}

  /** The liveness answer: the process is running and can serve a request. */
  live(): HealthReport {
    return {
      status: 'up',
      uptime: Math.round(process.uptime()),
      ...(this.options.info ? { info: this.options.info } : {}),
      checks: {},
    };
  }

  /** The readiness answer: everything this service depends on is usable. */
  async ready(): Promise<HealthReport> {
    const results = await Promise.all(
      this.indicators.map(async (indicator) => {
        const result = await this.run(indicator);

        return [indicator.name, result] as const;
      }),
    );

    const checks = Object.fromEntries(results);
    const down = results.some(([, result]) => result.status === 'down');

    return {
      status: down ? 'down' : 'up',
      uptime: Math.round(process.uptime()),
      ...(this.options.info ? { info: this.options.info } : {}),
      checks,
    };
  }

  private async run(indicator: HealthIndicator): Promise<HealthCheckResult> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        Promise.resolve(indicator.check()),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`Timed out after ${this.options.timeoutMs}ms`)),
            this.options.timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Without this the timer keeps the event loop alive for its full
      // duration after a fast check has already answered.
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
