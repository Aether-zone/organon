import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

import {
  LOGGER_OPTIONS,
  type ResolvedLoggerOptions,
} from './logger.options.js';
import {
  REQUEST_ID_PROPERTY,
  newRequestId,
  runWithRequestContext,
} from './request-context.js';

/**
 * Gives every request an id and puts it in scope for everything that request
 * goes on to do.
 *
 * Middleware rather than an interceptor, because middleware runs *first* —
 * before guards, pipes and the handler. An interceptor would leave anything a
 * guard logged, including a rejected authentication, outside the context and
 * so unattributable to a request.
 *
 * An inbound id is honoured when the header carries one, so a request crossing
 * two services keeps a single id and its logs join up. That header is
 * caller-controlled input: it is length-capped and stripped of anything but
 * safe characters before being written anywhere.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(LOGGER_OPTIONS)
    private readonly options: ResolvedLoggerOptions,
  ) {}

  use(request: unknown, response: unknown, next: () => void): void {
    const requestId = this.resolveId(request);

    if (request !== null && typeof request === 'object') {
      (request as Record<string, unknown>)[REQUEST_ID_PROPERTY] = requestId;
    }

    setResponseHeader(response, this.options.requestIdHeader, requestId);

    runWithRequestContext({ requestId }, next);
  }

  private resolveId(request: unknown): string {
    if (!this.options.trustInboundRequestId) {
      return newRequestId();
    }

    const inbound = readHeader(request, this.options.requestIdHeader);

    return inbound === undefined ? newRequestId() : inbound;
  }
}

/**
 * Reads a header and refuses anything that is not plainly an id. An id ends up
 * in log files and in a response header, so a caller must not be able to put a
 * newline, a quote or a kilobyte of text into either.
 */
function readHeader(request: unknown, name: string): string | undefined {
  if (request === null || typeof request !== 'object') {
    return undefined;
  }

  const headers = (request as { headers?: unknown }).headers;

  if (headers === null || typeof headers !== 'object') {
    return undefined;
  }

  const raw: unknown = (headers as Record<string, unknown>)[name.toLowerCase()];

  // `Array.isArray` narrows `unknown` to `any[]`, so the element has to be
  // named `unknown` again rather than inherited. A repeated header arrives as
  // an array; only the first is considered.
  const value: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : undefined;
}

function setResponseHeader(
  response: unknown,
  name: string,
  value: string,
): void {
  if (response === null || typeof response !== 'object') {
    return;
  }

  // Express `setHeader`, Fastify `header`. Neither is assumed to be there.
  const target = response as {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => void;
  };

  if (typeof target.setHeader === 'function') {
    target.setHeader(name, value);
  } else if (typeof target.header === 'function') {
    target.header(name, value);
  }
}
