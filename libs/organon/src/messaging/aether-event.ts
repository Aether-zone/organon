import { z } from 'zod';

import type { JsonLdDocument } from '../json-ld/index.js';

/**
 * What one service tells the rest of aether-zone happened to a resource.
 *
 * This is the *payload*, not the transport. {@link RabbitEvent} is the envelope
 * `EventPublisher` puts around anything it publishes; an Aether event is one of
 * the things that travels inside one. See the warning on `id` below — the two
 * have a field in common and the envelope wins.
 *
 * Deliberately CloudEvents-shaped (`id`, `type`, `source`, `time`, `subject`,
 * `data`) without claiming to be CloudEvents: a consumer that already speaks
 * that vocabulary reads this without a translation table, and nothing here
 * promises the parts of the spec that are not implemented.
 */

export const AETHER_EVENT_TYPES = [
  'aether:ResourceCreated',
  'aether:ResourceUpdated',
  'aether:ResourceDeleted',
] as const;

export const aetherEventTypeSchema = z.enum(AETHER_EVENT_TYPES);

export type AetherEventType = z.infer<typeof aetherEventTypeSchema>;

/** Who caused it. Provenance — never read as an authorization decision. */
export const aetherActorSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
});

export type AetherActor = z.infer<typeof aetherActorSchema>;

/**
 * The fields every Aether event carries.
 *
 * **`id` collides with the transport envelope.** `EventPublisher.publish`
 * spreads {@link baseEvent} *last*, so publishing an Aether event through it
 * replaces this `id` with the envelope's own. Either publish the payload under
 * a key of its own, or treat the envelope's id as the one that identifies the
 * message and this one as the id of the *fact* — but do not assume both
 * survive.
 *
 * `time` is an ISO 8601 **string**, not a `Date`. An event crosses a process
 * boundary as JSON, where a Date arrives as a string anyway; typing it as a
 * Date means every consumer's value disagrees with its type. This matches
 * `RabbitEvent.occurredAt` for the same reason.
 */
const baseAetherEventSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  time: z.iso.datetime(),
  /**
   * The resource the event is about, as an IRI.
   *
   * Required in practice for all three types: a create or update must name
   * what it changed, and a delete has nothing else to identify the resource by
   * once `data` is gone.
   */
  subject: z.string().min(1),
  /** Which tenant the resource belongs to, where the producer knows. */
  organizationId: z.string().min(1).optional(),
  actor: aetherActorSchema.optional(),
});

/**
 * A JSON-LD resource, loosely: enough to check the invariant below without
 * this library taking a view on the rest of the document.
 */
const resourceSchema = z.looseObject({ '@id': z.string().min(1) });

/**
 * Runtime validation for an event arriving from another service.
 *
 * The rule worth having is the last one: on a create or update, `subject` must
 * be the `@id` of `data`. They are the same fact stated twice, and an event
 * where they disagree is one a consumer would happily write to the wrong node.
 * A delete carries no `data` at all — there is nothing left to describe.
 */
export const aetherEventSchema = z
  .discriminatedUnion('type', [
    baseAetherEventSchema.extend({
      type: z.literal('aether:ResourceCreated'),
      data: resourceSchema,
    }),
    baseAetherEventSchema.extend({
      type: z.literal('aether:ResourceUpdated'),
      data: resourceSchema,
    }),
    baseAetherEventSchema.extend({
      type: z.literal('aether:ResourceDeleted'),
    }),
  ])
  .refine(
    (event) =>
      event.type === 'aether:ResourceDeleted' ||
      event.subject === event.data['@id'],
    {
      error:
        'subject must be the @id of data: an event that states the resource twice must state it the same way',
      path: ['subject'],
    },
  );

/*
 * The authored types are generic over the document so a producer can say what
 * it is sending — `AetherEvent<Meeting>` — while the schema above stays
 * concrete, because validation happens on data whose shape is not yet known.
 */

export interface AetherResourceCreatedEvent<T = JsonLdDocument> extends z.infer<
  typeof baseAetherEventSchema
> {
  type: 'aether:ResourceCreated';
  data: T;
}

export interface AetherResourceUpdatedEvent<T = JsonLdDocument> extends z.infer<
  typeof baseAetherEventSchema
> {
  type: 'aether:ResourceUpdated';
  data: T;
}

export interface AetherResourceDeletedEvent extends z.infer<
  typeof baseAetherEventSchema
> {
  type: 'aether:ResourceDeleted';
}

export type AetherEvent<T = JsonLdDocument> =
  | AetherResourceCreatedEvent<T>
  | AetherResourceUpdatedEvent<T>
  | AetherResourceDeletedEvent;
