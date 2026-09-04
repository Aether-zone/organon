import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import {
  AppConfigModule,
  ENV,
  ENV_SCHEMA,
  type EnvService,
} from './config.module.js';
import { JsonLogger } from '../logging/json-logger.js';
import { LOG_LEVELS } from '../logging/log-level.js';
import { baseEnvSchema, booleanFromString, validateEnv } from './env.schema.js';

/** An application's own schema — the thing the module now takes rather than owns. */
const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  FEATURE_X: booleanFromString.default(false),
  RETRIES: z.coerce.number().int().default(3),
});

type Env = z.infer<typeof envSchema>;

@Injectable()
class Consumer {
  constructor(
    @Inject(ENV) readonly env: Env,
    // `EnvService<Env>` is a type alias, so it is not a DI token — the class
    // has to be named explicitly. See the note on the type.
    @Inject(ConfigService) readonly config: EnvService<Env>,
  ) {}
}

/** Builds a module against a given environment, with `.env` files ignored. */
async function boot(environment: Record<string, string>) {
  const previous = process.env;
  process.env = { ...environment };

  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule.forRoot({ schema: envSchema, ignoreEnvFile: true }),
      ],
      providers: [Consumer],
    }).compile();

    return moduleRef.get(Consumer);
  } finally {
    process.env = previous;
  }
}

describe('booleanFromString', () => {
  it('reads "false" as false, which Boolean() does not', () => {
    expect(booleanFromString.parse('false')).toBe(false);
    expect(booleanFromString.parse('0')).toBe(false);
    expect(booleanFromString.parse('true')).toBe(true);
    expect(booleanFromString.parse('1')).toBe(true);
  });
});

describe('baseEnvSchema LOG_LEVEL', () => {
  const parse = (value?: string) =>
    baseEnvSchema.parse(value === undefined ? {} : { LOG_LEVEL: value });

  it('is undefined when unset, rather than defaulted', () => {
    // "Not configured" has to stay distinguishable from "configured as log",
    // so JsonLogger can apply its own NODE_ENV-dependent fallback.
    expect(parse().LOG_LEVEL).toBeUndefined();
  });

  it('accepts every level the logger knows', () => {
    for (const level of LOG_LEVELS) {
      expect(parse(level).LOG_LEVEL).toBe(level);
    }
  });

  it('forgives case and surrounding space', () => {
    expect(parse('DEBUG').LOG_LEVEL).toBe('debug');
    expect(parse('  Warn  ').LOG_LEVEL).toBe('warn');
  });

  it('refuses a level that is not one', () => {
    // `info` is the common name elsewhere; Nest calls it `log`, and the error
    // says so rather than guessing.
    expect(() => parse('info')).toThrow();
    expect(() => parse('trace')).toThrow();
  });

  it('reports an unknown level readably through validateEnv', () => {
    expect(() => validateEnv(baseEnvSchema)({ LOG_LEVEL: 'info' })).toThrow(
      /LOG_LEVEL/,
    );
    expect(() => validateEnv(baseEnvSchema)({ LOG_LEVEL: 'info' })).toThrow(
      /verbose/,
    );
  });

  it('feeds JsonLogger directly', () => {
    const records: { level: string }[] = [];
    const env = baseEnvSchema.parse({ LOG_LEVEL: 'WARN' });
    const logger = new JsonLogger({
      level: env.LOG_LEVEL,
      write: (record) => records.push({ level: record.level }),
    });

    logger.debug('quiet');
    logger.log('quiet');
    logger.warn('loud');

    expect(records.map((r) => r.level)).toEqual(['warn']);
  });
});

describe('validateEnv', () => {
  it('lists every problem, naming the variable', () => {
    const validate = validateEnv(envSchema);

    expect(() => validate({ NODE_ENV: 'banana' })).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => validate({ NODE_ENV: 'banana' })).toThrow(/NODE_ENV/);
    expect(() => validate({ NODE_ENV: 'banana' })).toThrow(/DATABASE_URL/);
  });

  it('returns the parsed value, with defaults and coercions applied', () => {
    const parsed = validateEnv(envSchema)({ DATABASE_URL: 'postgres://x' });

    expect(parsed).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgres://x',
      FEATURE_X: false,
      RETRIES: 3,
    });
  });
});

describe('AppConfigModule.forRoot', () => {
  it('validates against the schema it was given, not one of its own', async () => {
    const consumer = await boot({
      DATABASE_URL: 'postgres://localhost/app',
      RETRIES: '7',
    });

    expect(consumer.env.DATABASE_URL).toBe('postgres://localhost/app');
  });

  it('provides the whole parsed environment under ENV', async () => {
    const consumer = await boot({
      DATABASE_URL: 'postgres://x',
      PORT: '4000',
      FEATURE_X: 'true',
    });

    // Coerced and defaulted, not the raw strings.
    expect(consumer.env).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      DATABASE_URL: 'postgres://x',
      FEATURE_X: true,
      RETRIES: 3,
    });
    expect(typeof consumer.env.PORT).toBe('number');
    expect(typeof consumer.env.FEATURE_X).toBe('boolean');
  });

  it('still works through ConfigService', async () => {
    const consumer = await boot({ DATABASE_URL: 'postgres://x', PORT: '4100' });

    expect(consumer.config.get('PORT', { infer: true })).toBe(4100);
  });

  it('refuses to boot on an invalid environment', async () => {
    // DATABASE_URL is required by the *application's* schema.
    await expect(boot({ PORT: '3000' })).rejects.toThrow(
      /Invalid environment configuration/,
    );
  });

  it('exposes the schema it was configured with', async () => {
    const previous = process.env;
    process.env = { DATABASE_URL: 'postgres://x' };

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot({ schema: envSchema, ignoreEnvFile: true }),
        ],
      }).compile();

      expect(moduleRef.get(ENV_SCHEMA)).toBe(envSchema);
    } finally {
      process.env = previous;
    }
  });

  it('takes a validator that is not a zod schema', async () => {
    // The module depends on `safeParse`, not on zod.
    const handRolled = {
      safeParse: (value: unknown) => ({
        success: true as const,
        data: { ...(value as object), CUSTOM: 'yes' } as Record<
          string,
          unknown
        >,
      }),
    };

    const previous = process.env;
    process.env = {};

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          AppConfigModule.forRoot({ schema: handRolled, ignoreEnvFile: true }),
        ],
      }).compile();

      expect(moduleRef.get<Record<string, unknown>>(ENV).CUSTOM).toBe('yes');
    } finally {
      process.env = previous;
    }
  });
});
