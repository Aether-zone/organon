import { randomUUID } from 'node:crypto';

/**
 * The shape every event on the bus shares.
 *
 * Events cross a process boundary, so this is a plain serialisable object
 * rather than a class with behaviour: what a consumer receives is whatever
 * survived `JSON.stringify`, and a class would arrive as an object claiming to
 * be one.
 *
 * **No credential rides along, deliberately.** A token in a message is a
 * credential in a queue: written to the broker's disk for a durable queue,
 * readable by anything that can read the queue, and left in a dead-letter queue
 * when a consumer keeps failing. It also expires on a schedule the queue knows
 * nothing about, so a backlog delivers tokens no longer worth presenting. A
 * consumer that must call another service acts as itself, with its own
 * credentials, and takes the subject from the event's own fields.
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
}

/** Fills in what every event carries, so a publisher states only its own fields. */
export const baseEvent = (): RabbitEvent => ({
  id: randomUUID(),
  occurredAt: new Date().toISOString(),
});
