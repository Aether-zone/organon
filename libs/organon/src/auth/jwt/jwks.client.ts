import { createPublicKey } from 'node:crypto';

import { type JsonWebKeyDTO } from '../jwks.js';

/**
 * Fetches and caches the authorization server's public signing keys.
 *
 * Deliberately dependency-free: Node can turn a JWK straight into a `KeyObject`,
 * so the usual `jwks-rsa` client would only be wrapping `createPublicKey` and a
 * `Map`. It mirrors how pistis signs — no JWT library on either side.
 *
 * The cache is keyed by `kid` and refetched when a token names one it has not
 * seen, which is what makes key rotation a non-event: the first token signed by
 * a new key misses, triggers one fetch, and every later token hits.
 */
export class JwksClient {
  /**
   * kid → SPKI PEM. Stored exported rather than as a `KeyObject`, because
   * that is the shape passport-jwt's `secretOrKey` is typed for, and doing
   * the conversion once per key beats doing it once per request.
   */
  private keys = new Map<string, string>();
  /** Set while a fetch is in flight, so a burst of requests makes one request. */
  private inFlight: Promise<void> | null = null;
  private lastFetchedAt = 0;

  constructor(
    private readonly jwksUri: string,
    /** Floor between refetches, so an unknown `kid` cannot be used to hammer pistis. */
    private readonly minRefetchIntervalMs = 10_000,
  ) {}

  async getKey(kid: string): Promise<string> {
    const cached = this.keys.get(kid);

    if (cached) {
      return cached;
    }

    await this.refresh();

    const key = this.keys.get(kid);

    if (!key) {
      throw new Error(`No signing key in ${this.jwksUri} for kid "${kid}"`);
    }

    return key;
  }

  private async refresh(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }

    if (Date.now() - this.lastFetchedAt < this.minRefetchIntervalMs) {
      return;
    }

    this.inFlight = this.fetchKeys().finally(() => {
      this.inFlight = null;
      this.lastFetchedAt = Date.now();
    });

    return this.inFlight;
  }

  private async fetchKeys(): Promise<void> {
    const response = await fetch(this.jwksUri);

    if (!response.ok) {
      throw new Error(
        `Could not read the signing keys from ${this.jwksUri}: ` +
          `${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as { keys?: JsonWebKeyDTO[] };

    for (const jwk of body.keys ?? []) {
      // Signature verification only; an encryption key would be a
      // different algorithm and must not be accepted here.
      if (jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) {
        continue;
      }

      this.keys.set(
        jwk.kid,
        createPublicKey({ key: jwk as never, format: 'jwk' })
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      );
    }
  }
}
