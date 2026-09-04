import { randomUUID } from 'node:crypto';

/**
 * The shape every event on the bus shares.
 *
 * Events cross a process boundary, so this is a plain serialisable object
 * rather than a class with behaviour: what a consumer receives is whatever
 * survived `JSON.stringify`, and a class would arrive as an object claiming to
 * be one.
 */
export interface RabbitEvent {
  /**
   * Unique per publish. The same id survives a redelivery, so a consumer that
   * must not act twice has something to deduplicate on — at-least-once is what
   * the broker offers, and idempotency is the consumer's half of that bargain.
   */
  id: string;
  /** When the thing happened, not when the message was delivered. */
  occurredAt: string;
  /**
   * The access token of whoever caused this.
   *
   * Work that starts from an event has no request to borrow from, and a service
   * that needs to call another on the subject's behalf would otherwise have to
   * act as itself — losing which person a request was for, and needing an
   * authority of its own for work a person asked for.
   *
   * Three things follow, and none of them are theoretical:
   *
   * - **A token in a message is a credential in a queue.** It is written to the
   *   broker's disk for a durable queue, is readable by anything that can read
   *   the queue, and lands in a dead-letter queue if the consumer keeps
   *   failing. Broker access is token access; grant it accordingly.
   * - **It expires.** A message that waits — a backlog, a retry, a queue that
   *   was down — can be delivered with a token no longer worth presenting.
   *   {@link isExpired} answers that; a consumer that finds one should fall
   *   back to its own credentials or give up, not retry forever.
   * - **It is not proof of anything by itself.** A consumer that acts on the
   *   token's claims must verify it, exactly as it would from an HTTP header.
   */
  accessToken: string;
}

/** Fills in what every event carries, so a publisher states only its own fields. */
export const baseEvent = (accessToken: string): RabbitEvent => ({
  id: randomUUID(),
  occurredAt: new Date().toISOString(),
  accessToken,
});

/**
 * Whether the event's token has expired, or expires within `withinSeconds`.
 *
 * Reads the `exp` claim **without verifying the signature**, which is all this
 * can do and all it is for: deciding whether presenting the token is worth
 * trying. Nothing here is a permission — the service the token is presented to
 * verifies it properly, and a token this says is fine may still be refused.
 *
 * A token that cannot be parsed counts as expired. Something unusable arrived,
 * and the caller's fallback is the same either way.
 */
export function isExpired(event: RabbitEvent, withinSeconds = 30): boolean {
  const payload = event.accessToken?.split('.')[1];

  if (!payload) {
    return true;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: unknown };

    if (typeof claims.exp !== 'number') {
      return true;
    }

    return claims.exp * 1000 <= Date.now() + withinSeconds * 1000;
  } catch {
    return true;
  }
}
