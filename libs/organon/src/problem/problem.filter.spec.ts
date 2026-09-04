import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { PROBLEM_CONTENT_TYPE, type ProblemDocument } from './problem.js';
import { ProblemException } from './problem.exception.js';
import { ProblemExceptionFilter } from './problem.filter.js';

/** Captures what the filter asked the platform adapter to send. */
function harness(url = '/organizations/acme') {
  const sent: {
    body?: ProblemDocument;
    status?: number;
    headers: Record<string, string>;
  } = { headers: {} };

  const httpAdapter = {
    getRequestUrl: () => url,
    setHeader: (_response: unknown, name: string, value: string) => {
      sent.headers[name] = value;
    },
    reply: (_response: unknown, body: ProblemDocument, status: number) => {
      sent.body = body;
      sent.status = status;
    },
  };

  const filter = new ProblemExceptionFilter({
    httpAdapter,
  } as unknown as HttpAdapterHost);

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  return { filter, host, sent };
}

describe('ProblemExceptionFilter', () => {
  beforeEach(() => {
    // The filter logs unhandled exceptions on purpose; keep that out of the run.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('serves the problem+json media type', () => {
    const { filter, host, sent } = harness();

    filter.catch(new NotFoundException(), host);

    expect(sent.headers['Content-Type']).toBe(PROBLEM_CONTENT_TYPE);
  });

  it('renders a ProblemException as its own document', () => {
    const { filter, host, sent } = harness();

    filter.catch(
      new ProblemException({
        status: HttpStatus.CONFLICT,
        type: 'https://example.com/probs/slug-taken',
        title: 'That slug is already in use',
        detail: '"acme" belongs to another organization.',
        extensions: { slug: 'acme' },
      }),
      host,
    );

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      type: 'https://example.com/probs/slug-taken',
      title: 'That slug is already in use',
      status: 409,
      detail: '"acme" belongs to another organization.',
      instance: '/organizations/acme',
      slug: 'acme',
    });
  });

  it('does not overwrite an instance the thrower chose', () => {
    const { filter, host, sent } = harness();

    filter.catch(
      new ProblemException({ status: 410, instance: 'urn:uuid:abc' }),
      host,
    );

    expect(sent.body?.instance).toBe('urn:uuid:abc');
  });

  it('maps a plain Nest exception, keeping its message as the detail', () => {
    const { filter, host, sent } = harness();

    filter.catch(new NotFoundException('No such organization'), host);

    expect(sent.status).toBe(404);
    expect(sent.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'No such organization',
      instance: '/organizations/acme',
    });
  });

  it('splits validation messages into an errors extension', () => {
    const { filter, host, sent } = harness();

    // The shape ValidationPipe throws.
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['name must be a string', 'slug should not be empty'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(sent.status).toBe(400);
    expect(sent.body?.errors).toEqual([
      'name must be a string',
      'slug should not be empty',
    ]);
    // An array joined into `detail` would be unusable for marking up fields.
    expect(sent.body?.detail).toBeUndefined();
  });

  it('keeps extra members a hand-built envelope carried', () => {
    const { filter, host, sent } = harness();

    filter.catch(
      new HttpException(
        {
          statusCode: 429,
          message: 'Slow down',
          error: 'Too Many Requests',
          retryAfter: 30,
        },
        429,
      ),
      host,
    );

    expect(sent.body).toMatchObject({
      title: 'Too Many Requests',
      detail: 'Slow down',
      retryAfter: 30,
    });
    // The envelope's own key is not a problem member and must not survive.
    expect('statusCode' in (sent.body ?? {})).toBe(false);
  });

  it('never leaks an unexpected error to the client', () => {
    const { filter, host, sent } = harness();

    filter.catch(
      new Error('SELECT * FROM users WHERE token = "s3cret" failed'),
      host,
    );

    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/organizations/acme',
    });
    expect(JSON.stringify(sent.body)).not.toContain('s3cret');
  });

  it('logs the unexpected error it declined to send', () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { filter, host } = harness();

    filter.catch(new Error('boom'), host);

    expect(logged).toHaveBeenCalled();
  });

  it('rethrows outside an HTTP context rather than swallowing it', () => {
    const { filter } = harness();
    const rpc = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const error = new Error('from a message handler');

    expect(() => filter.catch(error, rpc)).toThrow(error);
  });
});
