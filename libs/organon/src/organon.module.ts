import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import {
  AppConfigModule,
  type AppConfigOptions,
} from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { type HealthModuleOptions } from './health/health.options.js';
import { LoggerModule } from './logging/logger.module.js';
import { type LoggerOptions } from './logging/logger.options.js';
import { ProblemExceptionFilter } from './problem/problem.filter.js';

export interface OrganonModuleOptions<TEnv extends Record<string, unknown>> {
  /**
   * Environment validation. Omitted, no configuration module is registered and
   * the application keeps whatever it already has — there is no default schema
   * to fall back on, because a library cannot know what an application's
   * environment looks like.
   */
  config?: AppConfigOptions<TEnv>;
  /** Health endpoints. `false` to leave them out. */
  health?: HealthModuleOptions | false;
  /** Request ids and a line per request. `false` to leave them out. */
  logging?: LoggerOptions | false;
  /**
   * Register {@link ProblemExceptionFilter} as the global exception filter, so
   * every failure renders as RFC 9457. `false` to leave the application's own
   * error rendering alone.
   */
  problem?: boolean;
}

/**
 * Everything organon offers a service, wired together.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     OrganonModule.forRoot({
 *       config: { schema: envSchema },
 *       logging: { base: { service: 'akouo' } },
 *       health: { indicators: [DatabaseHealth] },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * Each part is registrable on its own — `AppConfigModule`, `HealthModule`,
 * `LoggerModule` and the filter — and this changes none of their behaviour. It
 * exists because the four are worth having together, and because two pairs of
 * them only work properly when they know about each other:
 *
 * - **The problem filter reports the request id the logger issued.** A 500
 *   deliberately tells the client nothing, so the id is the only way to get
 *   from a report of a failure to the stack trace explaining it.
 * - **The health probes are excluded from the request log.** An orchestrator
 *   polls them every few seconds; left in, they are most of the log. That
 *   exclusion is derived from the health path, so it stays right when the path
 *   is changed.
 *
 * Nothing is registered globally that was not already: `AppConfigModule` and
 * `LoggerModule` are `@Global` in their own right, and the modules are
 * re-exported so `ConfigService`, `ENV` and `HealthService` resolve in the
 * importing module.
 */
@Module({})
export class OrganonModule {
  static forRoot<
    TEnv extends Record<string, unknown> = Record<string, unknown>,
  >(options: OrganonModuleOptions<TEnv> = {}): DynamicModule {
    const { config, health, logging, problem = true } = options;

    const healthOptions = health === false ? undefined : (health ?? {});
    const loggingOptions = logging === false ? undefined : (logging ?? {});

    const imports: DynamicModule[] = [];

    if (config) {
      imports.push(AppConfigModule.forRoot(config));
    }

    if (loggingOptions) {
      imports.push(
        LoggerModule.forRoot({
          ...loggingOptions,
          // Only derived when the consumer has not said what to ignore:
          // an explicit list is an instruction, not a starting point.
          ignorePaths:
            loggingOptions.ignorePaths ??
            (healthOptions ? healthRoutes(healthOptions.path) : []),
        }),
      );
    }

    if (healthOptions) {
      imports.push(HealthModule.forRoot(healthOptions));
    }

    const providers: Provider[] = problem
      ? [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }]
      : [];

    return {
      module: OrganonModule,
      imports,
      providers,
      // Re-exported so an importing module can inject what they provide.
      exports: imports,
    };
  }
}

/**
 * The three paths a health module answers on, so the request log can skip
 * them. Empty when health is not registered — there is nothing to skip, and a
 * hardcoded `/health` would silence a route the application may own itself.
 */
function healthRoutes(path = 'health'): string[] {
  const base = `/${path.replace(/^\/+|\/+$/g, '')}`;

  return [base, `${base}/live`, `${base}/ready`];
}
