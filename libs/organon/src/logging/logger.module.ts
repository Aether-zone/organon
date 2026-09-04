import {
  DynamicModule,
  Global,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { JsonLogger } from './json-logger.js';
import {
  LOGGER_OPTIONS,
  withLoggerDefaults,
  type LoggerOptions,
  type ResolvedLoggerOptions,
} from './logger.options.js';
import { LoggingInterceptor } from './logging.interceptor.js';
import { RequestContextMiddleware } from './request-context.middleware.js';

/**
 * Request ids and a line per request.
 *
 * ```ts
 * @Module({ imports: [LoggerModule.forRoot({ base: { service: 'akouo' } })] })
 * export class AppModule {}
 * ```
 *
 * The module wires the middleware that opens a request context and the
 * interceptor that logs the outcome. What it does **not** do is install
 * {@link JsonLogger} as the application logger — that has to happen before the
 * application is created, so no module can do it:
 *
 * ```ts
 * const app = await NestFactory.create(AppModule, {
 *   logger: new JsonLogger({ base: { service: 'akouo' } }),
 * });
 * ```
 *
 * Both take the same options for that reason; pass them the same object.
 *
 * `@Global()` because the point of a logger is to be reachable from anywhere
 * without every feature module importing it.
 */
@Global()
@Module({})
export class LoggerModule implements NestModule {
  private static options: ResolvedLoggerOptions = withLoggerDefaults();

  static forRoot(options: LoggerOptions = {}): DynamicModule {
    LoggerModule.options = withLoggerDefaults(options);

    return {
      module: LoggerModule,
      providers: [
        { provide: LOGGER_OPTIONS, useValue: LoggerModule.options },
        {
          provide: JsonLogger,
          useFactory: () => new JsonLogger(LoggerModule.options),
        },
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
        RequestContextMiddleware,
      ],
      exports: [LOGGER_OPTIONS, JsonLogger],
    };
  }

  /**
   * Applied to every route. A request id that only some routes carried would
   * be worse than none: the gap is invisible until the one request you need to
   * trace turns out to be in it.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
