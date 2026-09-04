import { Injectable } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { ENV } from './config/config.module.js';
import { baseEnvSchema } from './config/env.schema.js';
import { HealthService } from './health/health.service.js';
import {
  LOGGER_OPTIONS,
  type ResolvedLoggerOptions,
} from './logging/logger.options.js';
import { OrganonModule } from './organon.module.js';
import { ProblemExceptionFilter } from './problem/problem.filter.js';
import {
  type HealthCheckResult,
  type HealthIndicator,
} from './health/health-indicator.js';

const envSchema = baseEnvSchema.extend({ DATABASE_URL: z.string().min(1) });
type Env = z.infer<typeof envSchema>;

@Injectable()
class DatabaseHealth implements HealthIndicator {
  readonly name = 'database';
  check(): HealthCheckResult {
    return { status: 'up' };
  }
}

/** Compiles the aggregate module against a given environment. */
async function boot(
  options: Parameters<typeof OrganonModule.forRoot>[0] = {},
  environment: Record<string, string> = { DATABASE_URL: 'postgres://x' },
) {
  const previous = process.env;
  process.env = { ...environment };

  try {
    return await Test.createTestingModule({
      imports: [OrganonModule.forRoot(options)],
    }).compile();
  } finally {
    process.env = previous;
  }
}

describe('OrganonModule.forRoot', () => {
  it('wires configuration, health and logging in one import', async () => {
    const moduleRef = await boot({
      config: { schema: envSchema, ignoreEnvFile: true },
      health: { indicators: [DatabaseHealth] },
      logging: { base: { service: 'test' } },
    });

    expect(moduleRef.get<Env>(ENV).DATABASE_URL).toBe('postgres://x');
    expect(moduleRef.get(ConfigService)).toBeDefined();
    expect(moduleRef.get(HealthService)).toBeInstanceOf(HealthService);
    expect(await moduleRef.get(HealthService).ready()).toMatchObject({
      status: 'up',
      checks: { database: { status: 'up' } },
    });
  });

  /*
   * The filter is asserted on the module definition rather than through the
   * container: an APP_FILTER provider is consumed by Nest's enhancer system
   * and is not addressable by token afterwards. That it actually renders a
   * failure as a problem document is covered where it is observable — over
   * HTTP, in problem.filter.spec.ts and against a real server.
   */
  const filterProviders = (
    options: Parameters<typeof OrganonModule.forRoot>[0] = {},
  ) =>
    (OrganonModule.forRoot(options).providers ?? []).filter(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === APP_FILTER,
    );

  it('registers the problem filter globally by default', () => {
    expect(filterProviders()).toEqual([
      { provide: APP_FILTER, useClass: ProblemExceptionFilter },
    ]);
  });

  it('leaves the filter alone when asked', () => {
    expect(filterProviders({ problem: false })).toEqual([]);
  });

  it('keeps the health probes out of the request log', async () => {
    const moduleRef = await boot();
    const logging = moduleRef.get<ResolvedLoggerOptions>(LOGGER_OPTIONS);

    expect(logging.ignorePaths).toEqual([
      '/health',
      '/health/live',
      '/health/ready',
    ]);
  });

  it('follows the health path when it is moved', async () => {
    const moduleRef = await boot({ health: { path: 'internal/health' } });
    const logging = moduleRef.get<ResolvedLoggerOptions>(LOGGER_OPTIONS);

    // Derived rather than hardcoded, so the two cannot drift apart.
    expect(logging.ignorePaths).toEqual([
      '/internal/health',
      '/internal/health/live',
      '/internal/health/ready',
    ]);
  });

  it('ignores nothing when health is not registered', async () => {
    // A hardcoded /health would silence a route the application owns itself.
    const moduleRef = await boot({ health: false });
    const logging = moduleRef.get<ResolvedLoggerOptions>(LOGGER_OPTIONS);

    expect(logging.ignorePaths).toEqual([]);
  });

  it('treats an explicit ignorePaths as an instruction, not a starting point', async () => {
    const moduleRef = await boot({ logging: { ignorePaths: ['/metrics'] } });
    const logging = moduleRef.get<ResolvedLoggerOptions>(LOGGER_OPTIONS);

    expect(logging.ignorePaths).toEqual(['/metrics']);
  });

  it('omits health and logging when both are off', async () => {
    const moduleRef = await boot({ health: false, logging: false });

    expect(() => moduleRef.get(HealthService)).toThrow();
    expect(() => {
      moduleRef.get(LOGGER_OPTIONS);
    }).toThrow();
  });

  it('registers nothing configuration-related when no schema is given', async () => {
    // There is no default schema to fall back on.
    const moduleRef = await boot({});

    expect(() => {
      moduleRef.get(ENV);
    }).toThrow();
  });

  it('still validates the environment it was given a schema for', async () => {
    await expect(
      boot(
        { config: { schema: envSchema, ignoreEnvFile: true } },
        { PORT: '3000' },
      ),
    ).rejects.toThrow(/Invalid environment configuration/);
  });
});
