import { DynamicModule, Module } from '@nestjs/common';
import {
  ConfigModule as NestConfigModule,
  ConfigService,
} from '@nestjs/config';

import { validateEnv, type EnvValidator } from './env.schema.js';

/**
 * The validated environment, injectable as a plain object.
 *
 * ```ts
 * constructor(@Inject(ENV) private readonly env: Env) {}
 * ```
 *
 * Preferable to `ConfigService.get` where a whole typed object is wanted:
 * there is no key to misspell, and no `| undefined` to talk your way past.
 */
export const ENV = 'ORGANON_ENV';

/** The schema the environment was validated against, for anything that needs it. */
export const ENV_SCHEMA = 'ORGANON_ENV_SCHEMA';

/**
 * {@link ConfigService} narrowed to an application's own environment, so
 * `get(key, { infer: true })` is typed.
 *
 * It is a **type alias, not a class**, so it is not a DI token: annotating a
 * constructor parameter with it alone emits `Object` as the design type and
 * Nest fails to resolve it. Name the class as well:
 *
 * ```ts
 * constructor(
 *   @Inject(ConfigService) private readonly config: EnvService<Env>,
 * ) {}
 * ```
 *
 * Injecting {@link ENV} avoids the question entirely, and is usually what you
 * want.
 */
export type EnvService<TEnv extends Record<string, unknown>> = ConfigService<
  TEnv,
  true
>;

export interface AppConfigOptions<TEnv extends Record<string, unknown>> {
  /**
   * What the environment is validated against — the application's own schema,
   * not one this library invented. Nothing boots until it parses.
   */
  schema: EnvValidator<TEnv>;
  /** Defaults to `['.env.local', '.env']`, nearest first. */
  envFilePath?: string | string[];
  /** Defaults to true; a configuration module nobody can reach is not useful. */
  isGlobal?: boolean;
  /** Defaults to true. */
  cache?: boolean;
  /** `${OTHER_VAR}` interpolation. Defaults to true. */
  expandVariables?: boolean;
  /** Read only the real environment, ignoring any `.env` file. */
  ignoreEnvFile?: boolean;
}

/**
 * Loads the environment, validates it against a schema the **application**
 * supplies, and makes the result available through `ConfigService` and the
 * {@link ENV} token.
 *
 * ```ts
 * @Module({ imports: [AppConfigModule.forRoot({ schema: envSchema })] })
 * export class AppModule {}
 * ```
 *
 * The schema is a parameter rather than something this module owns, because a
 * shared library cannot know what an application's environment looks like. A
 * schema fixed here would name variables that mean nothing to most consumers
 * and, worse, *require* them — a required variable in a library schema is a
 * boot failure for everyone who does not happen to have it set.
 *
 * There is no `forRootAsync`. A schema is a compile-time constant: there is
 * nothing to await, and no earlier provider that could supply one, because
 * this is the module everything else takes its configuration from.
 *
 * One thing to know about the failure: a bad environment throws during module
 * initialisation, and `NestFactory` defaults to `abortOnError: true`, which
 * logs the error and exits rather than rejecting. Combined with
 * `{ logger: false }` that means a silent exit code 1 — the message is
 * produced, but nothing is left to print it. Pass `abortOnError: false` if you
 * would rather handle the rejection yourself.
 */
@Module({})
export class AppConfigModule {
  static forRoot<TEnv extends Record<string, unknown>>(
    options: AppConfigOptions<TEnv>,
  ): DynamicModule {
    const {
      schema,
      envFilePath = ['.env.local', '.env'],
      isGlobal = true,
      cache = true,
      expandVariables = true,
      ignoreEnvFile = false,
    } = options;

    /*
     * Captured out of the validator so the parsed environment can be provided
     * whole, under `ENV`. Nest keeps the validated object inside
     * `ConfigService` and only hands it back a key at a time, so this is the
     * one place the entire typed result is in hand.
     *
     * Safe because Nest resolves a module's imports before its own providers:
     * `NestConfigModule` has validated by the time the factory below runs. The
     * factory says so out loud rather than trusting it silently.
     */
    let validated: TEnv | undefined;

    const validate = (raw: Record<string, unknown>): TEnv => {
      validated = validateEnv(schema)(raw);

      return validated;
    };

    return {
      module: AppConfigModule,
      global: isGlobal,
      imports: [
        NestConfigModule.forRoot({
          isGlobal,
          cache,
          expandVariables,
          ignoreEnvFile,
          envFilePath,
          validate,
        }),
      ],
      providers: [
        {
          provide: ENV,
          useFactory: (): TEnv => {
            if (validated === undefined) {
              throw new Error(
                'The environment was not validated before ENV was resolved. ' +
                  'This means AppConfigModule.forRoot() was not the module ' +
                  'that loaded the configuration.',
              );
            }

            return validated;
          },
        },
        { provide: ENV_SCHEMA, useValue: schema },
      ],
      exports: [NestConfigModule, ENV, ENV_SCHEMA],
    };
  }
}
