import { DynamicModule, Module, type Provider } from '@nestjs/common';

import { HEALTH_INDICATORS, type HealthIndicator } from './health-indicator.js';
import {
  HEALTH_OPTIONS,
  withHealthDefaults,
  type HealthModuleOptions,
} from './health.options.js';
import { createHealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * Liveness and readiness endpoints.
 *
 * ```ts
 * @Module({ imports: [HealthModule.forRoot()] })
 * export class AppModule {}
 * ```
 *
 * With dependencies to check, register indicators:
 *
 * ```ts
 * @Injectable()
 * class DatabaseHealth implements HealthIndicator {
 *   readonly name = 'database';
 *   constructor(private readonly db: DataSource) {}
 *
 *   async check(): Promise<HealthCheckResult> {
 *     await this.db.query('select 1');
 *     return { status: 'up' };
 *   }
 * }
 *
 * HealthModule.forRoot({
 *   imports: [DatabaseModule],
 *   indicators: [DatabaseHealth],
 *   info: { service: 'akouo', version: process.env.APP_VERSION },
 * });
 * ```
 *
 * The endpoints sit at `/health` unless `path` says otherwise:
 *
 * ```ts
 * HealthModule.forRoot({ path: 'internal/health' });
 * ```
 *
 * Pair it with the logger so the probes do not fill the log:
 * `LoggerModule.forRoot({ ignorePaths: ['/health', '/health/live', '/health/ready'] })`.
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}): DynamicModule {
    const resolved = withHealthDefaults(options);
    const indicators = resolved.indicators ?? [];

    /*
     * Nest has no multi-provider, so the array is assembled by a factory whose
     * `inject` is the indicator classes themselves. That is also what makes
     * them ordinary providers: an indicator can inject whatever it needs, as
     * long as the module supplying it is in `imports`.
     */
    const collect: Provider = {
      provide: HEALTH_INDICATORS,
      useFactory: (...resolvedIndicators: HealthIndicator[]) =>
        resolvedIndicators,
      inject: indicators,
    };

    return {
      module: HealthModule,
      imports: resolved.imports ?? [],
      controllers: [createHealthController(resolved.path)],
      providers: [
        { provide: HEALTH_OPTIONS, useValue: resolved },
        ...indicators,
        collect,
        HealthService,
      ],
      exports: [HealthService],
    };
  }
}
