import { z } from 'zod';

// The specific module, not the `logging` barrel: config is imported by almost
// everything, and reaching for the barrel would pull the logger, the
// interceptor and passport's peers in behind it.
import { LOG_LEVELS } from '../logging/log-level.js';

/**
 * Reads a boolean from an environment variable, which is always a string.
 *
 * `Boolean(process.env.X)` is true for the string `"false"`, which is the
 * mistake this exists to make unavailable.
 */
export const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * The two variables every service has, and nothing else.
 *
 * A shared library cannot know what an application's environment looks like,
 * so it must not claim to: a schema here naming a database or a bucket would
 * make every *other* consumer fail to boot for want of a variable that means
 * nothing to it. Extend this with your own:
 *
 * ```ts
 * export const envSchema = baseEnvSchema.extend({
 *   DATABASE_URL: z.url(),
 *   FEATURE_X: booleanFromString.default(false),
 * });
 *
 * export type Env = z.infer<typeof envSchema>;
 * ```
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Quietest level to log. The names are Nest's, so the middle one is `log`
   * rather than the `info` most tooling uses.
   *
   * Deliberately **optional rather than defaulted**. `JsonLogger` already
   * falls back to `log` under `NODE_ENV=production` and `debug` everywhere
   * else, and a default here would have to restate that rule — or, worse,
   * quietly override it, so an unset variable silenced debug output in
   * development. Leaving it undefined means "not configured", which is a
   * different thing from "configured as log", and passing it straight through
   * does the right thing either way:
   *
   * ```ts
   * new JsonLogger({ level: env.LOG_LEVEL })
   * ```
   *
   * Case and surrounding space are forgiven, because `LOG_LEVEL=DEBUG` is
   * what people actually write in a deployment.
   */
  LOG_LEVEL: z
    .preprocess(
      (value) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
      z.enum(LOG_LEVELS),
    )
    .optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Anything that can turn a raw environment into a validated one. A zod schema
 * satisfies it; so does a hand-written parser, for a consumer that wants one.
 */
export interface EnvValidator<TEnv> {
  safeParse(value: unknown):
    | { success: true; data: TEnv }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<{
            path: ReadonlyArray<PropertyKey>;
            message: string;
          }>;
        };
      };
}

/**
 * Turns a schema into the `validate` function Nest's `ConfigModule` takes.
 *
 * Failing the boot is the point. An environment variable that is missing or
 * malformed otherwise surfaces as `undefined` somewhere deep in a request,
 * hours later, as a error that says nothing about its cause.
 */
export const validateEnv =
  <TEnv>(schema: EnvValidator<TEnv>) =>
  (raw: Record<string, unknown>): TEnv => {
    const result = schema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map(
          (issue) =>
            `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
        )
        .join('\n');

      throw new Error(`Invalid environment configuration:\n${issues}`);
    }

    return result.data;
  };
