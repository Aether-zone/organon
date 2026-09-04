import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JWT_ALGORITHM } from '../jwks.js';
import { parseScope } from '../scope.js';
import { type AccessTokenClaimsDTO } from '../claims.js';

import {
  AUTH_OPTIONS,
  type ResolvedPistisAuthConfig,
} from '../auth.options.js';
import { type Principal } from '../principal.js';
import { JwksClient } from './jwks.client.js';

/**
 * Validates access tokens issued by pistis.
 *
 * Validation is offline: the signature is checked against pistis's published
 * JWKS and nothing else is asked of it, so a request costs no round trip to the
 * authorization server. The cost of that is a revoked token staying good until
 * it expires (`OAUTH_ACCESS_TOKEN_TTL`, an hour by default) — pistis keeps a row
 * per `jti` precisely so it *can* answer that question, through
 * `/oauth/introspect`, if revocation ever needs to take effect sooner.
 *
 * `algorithms` is pinned to a constant rather than read from the token's own
 * `alg`. That is what closes `alg: none` and the RSA-to-HMAC confusion attack,
 * and it is the same rule pistis applies when verifying.
 */
@Injectable()
export class PistisJwtStrategy extends PassportStrategy(
  Strategy,
  'pistis-jwt',
) {
  constructor(@Inject(AUTH_OPTIONS) options: ResolvedPistisAuthConfig) {
    const jwks = new JwksClient(options.jwksUri);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: [JWT_ALGORITHM],
      issuer: options.issuer,
      audience: options.audience,
      secretOrKeyProvider: (
        _request: unknown,
        rawToken: string,
        done: (error: Error | null, key?: string) => void,
      ) => {
        resolveKey(jwks, rawToken, options.tokenType).then(
          (key) => done(null, key),
          (error) => done(error as Error),
        );
      },
    });
  }

  validate(claims: AccessTokenClaimsDTO): Principal {
    if (!claims.sub) {
      throw new UnauthorizedException('Access token carries no subject');
    }

    return {
      id: claims.sub,
      clientId: claims.client_id,
      scopes: parseScope(claims.scope),
      organizations: claims.orgs ?? {},
    };
  }
}

/**
 * Reads the header to check the token type and pick a signing key.
 *
 * The header is parsed before any signature has been checked, so nothing in it
 * is trusted beyond those two uses — an attacker choosing a `kid` only chooses
 * which public key their forgery is checked against, and it still has to
 * verify. The `typ` check is the cheap half of keeping a pistis *session*
 * token, signed by the same key, out of a resource server.
 */
async function resolveKey(
  jwks: JwksClient,
  rawToken: string,
  expectedType: string,
): Promise<string> {
  const [encodedHeader] = rawToken.split('.');

  if (!encodedHeader) {
    throw new UnauthorizedException('Malformed access token');
  }

  let header: { kid?: unknown; typ?: unknown };

  try {
    header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    ) as { kid?: unknown; typ?: unknown };
  } catch {
    throw new UnauthorizedException('Malformed access token header');
  }

  if (header.typ !== expectedType) {
    throw new UnauthorizedException(
      `Unexpected token type; expected "${expectedType}"`,
    );
  }

  if (typeof header.kid !== 'string') {
    throw new UnauthorizedException('Access token names no signing key');
  }

  return jwks.getKey(header.kid);
}
