import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { requestIdOf } from '../logging/request-context.js';
import { ProblemException } from './problem.exception.js';
import {
  PROBLEM_CONTENT_TYPE,
  problem,
  titleForStatus,
  type ProblemDocument,
} from './problem.js';

/**
 * Renders every failure as an RFC 9457 problem document.
 *
 * `@Catch()` with no argument catches everything, which is the point: a filter
 * that only handled `ProblemException` would leave the *unexpected* errors —
 * the ones a client is least equipped to interpret — rendered as something
 * else entirely.
 *
 * Register it globally, where `APP_FILTER` gets `HttpAdapterHost` injected for
 * you:
 *
 * ```ts
 * import { APP_FILTER } from '@nestjs/core';
 *
 * @Module({
 *   providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
 * })
 * export class AppModule {}
 * ```
 *
 * `app.useGlobalFilters(new ProblemExceptionFilter(app.get(HttpAdapterHost)))`
 * works too, but a filter constructed by hand cannot inject anything else
 * later, so the provider form is the one to prefer.
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only HTTP has a response to write a document to. Rethrowing leaves an
    // rpc or websocket context to whatever filter does understand it, rather
    // than swallowing the error into a reply nobody is listening for.
    if (host.getType() !== 'http') {
      throw exception;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request: unknown = context.getRequest();
    const response: unknown = context.getResponse();

    // `getRequestUrl` is typed `any` on the abstract adapter, and not every
    // adapter implements it — Fastify returns undefined for some request
    // shapes — so the result is narrowed rather than trusted.
    const requestUrl: unknown = httpAdapter.getRequestUrl(request);
    const instance = typeof requestUrl === 'string' ? requestUrl : undefined;

    const document = this.toProblem(exception, instance);

    /*
     * The id the client is shown is the id in the logs. That is the whole
     * point of the pairing: an unexpected error deliberately tells the client
     * nothing about what went wrong, so without this there is no way to get
     * from "it failed" to the stack trace that says why.
     */
    const requestId = requestIdOf(request);

    if (requestId !== undefined && document.requestId === undefined) {
      document.requestId = requestId;
    }

    // Set before `reply`: the adapter may end the response, after which a
    // header can no longer be added.
    httpAdapter.setHeader(response, 'Content-Type', PROBLEM_CONTENT_TYPE);
    httpAdapter.reply(response, document, document.status);
  }

  private toProblem(exception: unknown, instance?: string): ProblemDocument {
    if (exception instanceof ProblemException) {
      // Its own `instance` wins: the thrower may know a more specific URI for
      // the occurrence than the request path.
      return exception.problem.instance === undefined
        ? { ...exception.problem, ...(instance ? { instance } : {}) }
        : exception.problem;
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, instance);
    }

    /*
     * Anything else is a bug, not a described failure. The message is
     * deliberately dropped: it is written for a developer and routinely names
     * a query, a path or a driver, none of which a client should be handed.
     * Logging it here is what keeps that from meaning "lost".
     */
    this.logger.error(
      'Unhandled exception; responding 500.',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return problem({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      instance,
    });
  }

  /**
   * Maps Nest's own errors, whose body is either a string or the
   * `{ statusCode, message, error }` envelope — and whose `message` is an
   * *array* when it came from `ValidationPipe`.
   */
  private fromHttpException(
    exception: HttpException,
    instance?: string,
  ): ProblemDocument {
    const status = exception.getStatus();
    const body: unknown = exception.getResponse();

    if (typeof body === 'string') {
      // `new NotFoundException('No such user')` — the string is the detail,
      // and the status phrase remains the title.
      return problem({ status, detail: body, instance });
    }

    if (body === null || typeof body !== 'object') {
      return problem({ status, instance });
    }

    const envelope = body as {
      message?: unknown;
      error?: unknown;
      [key: string]: unknown;
    };

    // A validation failure carries one message per broken rule. They belong in
    // an extension member, because a client that wants to mark up fields needs
    // them apart rather than joined into a sentence.
    const errors = Array.isArray(envelope.message)
      ? envelope.message.map((entry) => String(entry))
      : undefined;

    const detail =
      typeof envelope.message === 'string' ? envelope.message : undefined;

    /*
     * Nest puts the status *name* in `error` ("Not Found"), which is already
     * the title a blank-typed problem gets. Preferring it when it differs
     * keeps a hand-built body's own wording.
     */
    const title =
      typeof envelope.error === 'string'
        ? envelope.error
        : titleForStatus(status);

    // Whatever else the thrower put in the envelope is theirs and worth
    // keeping, minus the three members that map onto standard ones.
    const extensions = Object.fromEntries(
      Object.entries(envelope).filter(
        ([key]) => !['message', 'error', 'statusCode'].includes(key),
      ),
    );

    return problem({
      status,
      title,
      detail,
      instance,
      extensions: { ...extensions, ...(errors ? { errors } : {}) },
    });
  }
}
