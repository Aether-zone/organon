import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import {
  LOGGER_OPTIONS,
  type ResolvedLoggerOptions,
} from './logger.options.js';

/**
 * Logs one line per request, once it is done.
 *
 * The level follows the outcome rather than being fixed: a 5xx is an error, a
 * 4xx a warning, everything else routine. A log file where every request is at
 * the same level cannot be filtered, which is the same as not being able to
 * read it.
 *
 * Nothing about the request body, the query string or the headers is logged.
 * Bodies carry passwords, query strings carry tokens, and `Authorization`
 * carries the credential itself — a logger that captured them by default would
 * turn every log sink into a place secrets are kept.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Request');

  constructor(
    @Inject(LOGGER_OPTIONS)
    private readonly options: ResolvedLoggerOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.options.logRequests) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
    }>();
    const method = request.method ?? 'UNKNOWN';
    const url = request.originalUrl ?? request.url ?? '';
    const path = url.split('?')[0];

    if (this.options.ignorePaths.includes(path)) {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();

    const done = (status: number): void => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const message = `${method} ${path} ${status} ${durationMs.toFixed(1)}ms`;

      if (status >= 500) {
        this.logger.error(message);
      } else if (status >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<{ statusCode?: number }>();

          done(response.statusCode ?? 200);
        },
        /*
         * The failing path has to be logged here rather than left to the
         * exception filter. The filter renders the response, but an error
         * caught by a *different* filter — or by none — would otherwise leave
         * the request with no line at all, and a request that vanishes from
         * the log is worse than one logged twice.
         *
         * The response status is not set yet at this point, so it comes from
         * the exception.
         */
        error: (error: unknown) => {
          done(error instanceof HttpException ? error.getStatus() : 500);
        },
      }),
    );
  }
}
