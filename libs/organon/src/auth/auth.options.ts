import { ACCESS_TOKEN_TYPE } from './jwks.js';

export const AUTH_OPTIONS = 'PISTIS_AUTH_OPTIONS';

/** Everything a resource server needs in order to accept pistis tokens. */
export interface PistisAuthConfig {
  /**
   * `iss` every token must carry — pistis's own public origin, not this
   * service's. A token from anywhere else is refused even if its signature
   * is good.
   */
  issuer: string;
  /** `aud` every token must carry. pistis defaults this to its issuer. */
  audience: string;
  /** Where pistis publishes its public signing keys. */
  jwksUri: string;
  /**
   * `typ` the token header must carry. Defaults to `at+jwt`, which refuses a
   * pistis *session* token outright.
   *
   * Both kinds are signed by the same key, so only the header and audience
   * tell them apart. Checking the type as well as the audience means a
   * widened `audience` cannot quietly turn a session into an access token.
   */
  tokenType?: string;
}

/** Options as supplied, with the defaults applied. */
export interface ResolvedPistisAuthConfig extends PistisAuthConfig {
  tokenType: string;
}

export const withAuthDefaults = (
  config: PistisAuthConfig,
): ResolvedPistisAuthConfig => ({
  ...config,
  tokenType: config.tokenType ?? ACCESS_TOKEN_TYPE,
});

/**
 * A module configured from something that has to be resolved first — usually
 * a `ConfigService`.
 *
 * Declared here rather than imported so this package depends on Nest and
 * nothing else; every Nest codebase grows its own copy of this type, and one
 * more would be a dependency for four lines.
 */
export interface AsyncModuleConfig<T> {
  imports?: unknown[];
  inject?: unknown[];
  useFactory: (...args: never[]) => T | Promise<T>;
}
