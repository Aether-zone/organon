import { z } from 'zod';

/**
 * A single JSON Web Key. Only the RSA public parameters are ever published,
 * so `d` and the other private fields deliberately have no place here.
 */
export const jsonWebKeySchema = z.object({
  kty: z.literal('RSA'),
  use: z.literal('sig'),
  alg: z.literal('RS256'),
  kid: z.string(),
  n: z.string(),
  e: z.string(),
});

export const jsonWebKeySetSchema = z.object({
  keys: z.array(jsonWebKeySchema),
});

export type JsonWebKeyDTO = z.infer<typeof jsonWebKeySchema>;
export type JsonWebKeySetDTO = z.infer<typeof jsonWebKeySetSchema>;

/**
 * The algorithm pistis signs with, and the only one a verifier may accept.
 *
 * Pinning this — rather than dispatching on the token's own `alg` — is what
 * closes `alg: none` and the RSA-to-HMAC confusion attack. Both sides of the
 * exchange read it from here so they cannot drift apart.
 */
export const JWT_ALGORITHM = 'RS256';

/** `typ` of a pistis access token, per RFC 9068 §2.1. */
export const ACCESS_TOKEN_TYPE = 'at+jwt';

/**
 * `typ` of a pistis *session* token, which is not an access token and must
 * never be accepted as one.
 *
 * Both are signed by the same key, so the signature alone does not tell them
 * apart. Named here so a resource server can refuse one explicitly rather than
 * relying on the audience check to catch it by accident.
 */
export const SESSION_TOKEN_TYPE = 'session+jwt';

/**
 * Derives the JWKS URL from the issuer the way RFC 8414 lays it out, so a
 * deployment normally configures the issuer alone.
 */
export const jwksUriFor = (issuer: string): string =>
  `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
