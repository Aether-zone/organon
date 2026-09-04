import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { of, throwError, lastValueFrom, catchError } from 'rxjs';

import { withLoggerDefaults, type LoggerOptions } from './logger.options.js';
import { LoggingInterceptor } from './logging.interceptor.js';

type Level = 'log' | 'warn' | 'error';

function harness(
  options: LoggerOptions = {},
  request: Record<string, unknown> = { method: 'GET', url: '/things?page=2' },
  statusCode = 200,
) {
  const calls: { level: Level; message: string }[] = [];

  for (const level of ['log', 'warn', 'error'] as const) {
    jest
      .spyOn(Logger.prototype, level)
      .mockImplementation((message: unknown) => {
        calls.push({ level, message: String(message) });
      });
  }

  const interceptor = new LoggingInterceptor(withLoggerDefaults(options));

  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;

  return { interceptor, context, calls };
}

const handler = (value: unknown = 'ok'): CallHandler => ({
  handle: () => of(value),
});

describe('LoggingInterceptor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs method, path and status once the request is done', async () => {
    const { interceptor, context, calls } = harness();

    await lastValueFrom(interceptor.intercept(context, handler()));

    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('log');
    // The query string is dropped: it carries tokens and ids often enough that
    // logging it by default is a leak.
    expect(calls[0].message).toMatch(/^GET \/things 200 \d+\.\d+ms$/);
  });

  it('raises the level with the status', async () => {
    for (const [status, level] of [
      [200, 'log'],
      [301, 'log'],
      [404, 'warn'],
      [500, 'error'],
    ] as const) {
      const { interceptor, context, calls } = harness({}, undefined, status);

      await lastValueFrom(interceptor.intercept(context, handler()));

      expect(calls[0].level).toBe(level);
      jest.restoreAllMocks();
    }
  });

  it('logs a failing request, taking the status from the exception', async () => {
    const { interceptor, context, calls } = harness();
    const failing: CallHandler = {
      handle: () => throwError(() => new ForbiddenException()),
    };

    await lastValueFrom(
      interceptor.intercept(context, failing).pipe(catchError(() => of(null))),
    );

    expect(calls[0].level).toBe('warn');
    expect(calls[0].message).toContain('403');
  });

  it('treats an unrecognised error as a 500', async () => {
    const { interceptor, context, calls } = harness();
    const failing: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await lastValueFrom(
      interceptor.intercept(context, failing).pipe(catchError(() => of(null))),
    );

    expect(calls[0].level).toBe('error');
    expect(calls[0].message).toContain('500');
  });

  it('rethrows rather than swallowing the failure', async () => {
    const { interceptor, context } = harness();
    const boom = new Error('boom');
    const failing: CallHandler = { handle: () => throwError(() => boom) };

    await expect(
      lastValueFrom(interceptor.intercept(context, failing)),
    ).rejects.toBe(boom);
  });

  it('skips the paths it was told to ignore', async () => {
    const { interceptor, context, calls } = harness(
      { ignorePaths: ['/health'] },
      { method: 'GET', url: '/health' },
    );

    await lastValueFrom(interceptor.intercept(context, handler()));

    expect(calls).toHaveLength(0);
  });

  it('does nothing when request logging is off', async () => {
    const { interceptor, context, calls } = harness({ logRequests: false });

    await lastValueFrom(interceptor.intercept(context, handler()));

    expect(calls).toHaveLength(0);
  });
});
