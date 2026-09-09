import { baseEvent } from './event.js';

describe('baseEvent', () => {
  it('gives every event its own id, so a redelivery is recognisable', () => {
    expect(baseEvent().id).not.toBe(baseEvent().id);
  });

  it('timestamps when the thing happened, in a form that survives JSON', () => {
    const event = baseEvent();

    expect(new Date(event.occurredAt).getTime()).toBeCloseTo(Date.now(), -3);
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it('carries nothing but the envelope', () => {
    // The envelope is the whole contract. A credential in particular must not
    // reappear here: it would be written to the broker's disk and readable by
    // anything that can read the queue.
    expect(Object.keys(baseEvent()).sort()).toEqual(['id', 'occurredAt']);
  });
});
