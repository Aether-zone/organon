import { type JsonLdDocument } from '../json-ld/index.js';
import { aetherEventSchema, type AetherEvent } from './aether-event.js';

const SUBJECT = 'urn:meeting:1';

/** The event minus some fields, for the cases that are about an absence. */
const without = (event: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(event).filter(([key]) => !fields.includes(key)),
  );

const created = (over: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  type: 'aether:ResourceCreated',
  source: 'akouo',
  time: '2026-09-09T12:00:00.000Z',
  subject: SUBJECT,
  organizationId: '8a5cda03-72ff-422b-a8da-d5991e10c8fa',
  actor: { id: 'user-1', type: 'User' },
  data: { '@id': SUBJECT, '@type': 'Meeting', title: 'Standup' },
  ...over,
});

describe('a well-formed event', () => {
  it('accepts a create', () => {
    expect(aetherEventSchema.safeParse(created()).success).toBe(true);
  });

  it('accepts a delete, which carries no data', () => {
    const deleted = without(
      created({ type: 'aether:ResourceDeleted' }),
      'data',
    );

    expect(aetherEventSchema.safeParse(deleted).success).toBe(true);
  });

  it('accepts an event with no organization or actor', () => {
    // A service acting on its own behalf has neither.
    const bare = without(created(), 'organizationId', 'actor');

    expect(aetherEventSchema.safeParse(bare).success).toBe(true);
  });

  it('keeps whatever else the document carries', () => {
    const result = aetherEventSchema.safeParse(created());

    // The document is the producer's; this library checks `@id` and no more.
    expect(
      result.success &&
        result.data.type !== 'aether:ResourceDeleted' &&
        result.data.data.title,
    ).toBe('Standup');
  });
});

describe('time', () => {
  it('is an ISO 8601 string, because JSON has no Date', () => {
    // The shape this replaces typed it as `Date` while its own validator
    // required a string, so every event it built failed its own check.
    expect(aetherEventSchema.safeParse(created()).success).toBe(true);
    expect(
      aetherEventSchema.safeParse(created({ time: new Date() })).success,
    ).toBe(false);
    expect(
      aetherEventSchema.safeParse(created({ time: 'yesterday' })).success,
    ).toBe(false);
  });
});

describe('subject and data must agree', () => {
  it('refuses a create whose subject is not the data’s @id', () => {
    // The same fact stated twice; disagreeing means a consumer writes the
    // document to the wrong node.
    const result = aetherEventSchema.safeParse(
      created({ data: { '@id': 'urn:meeting:2', '@type': 'Meeting' } }),
    );

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual([
      'subject',
    ]);
  });

  it('refuses a create with no data at all', () => {
    expect(
      aetherEventSchema.safeParse(without(created(), 'data')).success,
    ).toBe(false);
  });

  it('refuses data with no @id, which nothing could be filed under', () => {
    expect(
      aetherEventSchema.safeParse(created({ data: { '@type': 'Meeting' } }))
        .success,
    ).toBe(false);
  });
});

describe('the envelope', () => {
  it.each(['id', 'source', 'subject'])('refuses an empty %s', (field) => {
    expect(aetherEventSchema.safeParse(created({ [field]: '' })).success).toBe(
      false,
    );
  });

  it('refuses a type it does not know', () => {
    expect(
      aetherEventSchema.safeParse(created({ type: 'aether:ResourceMoved' }))
        .success,
    ).toBe(false);
  });
});

describe('the authored type', () => {
  it('is generic over the document, so a producer can say what it sends', () => {
    interface Meeting extends JsonLdDocument {
      '@type': 'Meeting';
      title: string;
    }

    /*
     * Through a function returning the union, so `event` really is the union.
     * A `const` annotated with it is narrowed to the created variant by the
     * literal it is assigned, which would make the check below vacuous.
     */
    const asEvent = (event: AetherEvent<Meeting>) => event;

    const event = asEvent({
      id: 'evt-1',
      type: 'aether:ResourceCreated',
      source: 'akouo',
      time: '2026-09-09T12:00:00.000Z',
      subject: SUBJECT,
      data: {
        '@context': { title: 'https://schema.org/name' },
        '@id': SUBJECT,
        '@type': 'Meeting',
        title: 'Standup',
      },
    });

    // Narrowing on `type` is what gives a consumer `data` at all.
    expect(event.type !== 'aether:ResourceDeleted' && event.data.title).toBe(
      'Standup',
    );
    expect(aetherEventSchema.safeParse(event).success).toBe(true);
  });
});
