import { baseEvent, isExpired, type RabbitEvent } from './event.js';

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** A token shaped like a JWT; only the `exp` claim is ever read. */
const tokenExpiring = (secondsFromNow: number) =>
  `${b64({ alg: 'RS256' })}.${b64({
    exp: Math.floor(Date.now() / 1000) + secondsFromNow,
  })}.signature`;

const eventWith = (accessToken: string): RabbitEvent => ({
  ...baseEvent(accessToken),
});

describe('baseEvent', () => {
  it('carries the token it was given', () => {
    expect(baseEvent('token-123').accessToken).toBe('token-123');
  });

  it('gives every event its own id, so a redelivery is recognisable', () => {
    expect(baseEvent('t').id).not.toBe(baseEvent('t').id);
  });

  it('timestamps when the thing happened, in a form that survives JSON', () => {
    const event = baseEvent('t');

    expect(new Date(event.occurredAt).getTime()).toBeCloseTo(Date.now(), -3);
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});

describe('isExpired', () => {
  it('is false for a token with time left on it', () => {
    expect(isExpired(eventWith(tokenExpiring(3600)))).toBe(false);
  });

  it('is true once the token has expired', () => {
    expect(isExpired(eventWith(tokenExpiring(-1)))).toBe(true);
  });

  it('is true for one expiring inside the margin', () => {
    // A message delivered now but acted on a moment later must not present a
    // token that dies in between.
    expect(isExpired(eventWith(tokenExpiring(10)), 30)).toBe(true);
    expect(isExpired(eventWith(tokenExpiring(10)), 5)).toBe(false);
  });

  it.each([
    ['not-a-jwt', 'no segments'],
    ['', 'empty'],
    [`${b64({ alg: 'RS256' })}.not-base64!.sig`, 'an unreadable payload'],
    [`${b64({ alg: 'RS256' })}.${b64({ sub: 'x' })}.sig`, 'no exp claim'],
  ])('treats %p as expired — %s', (token) => {
    expect(isExpired(eventWith(token))).toBe(true);
  });
});
