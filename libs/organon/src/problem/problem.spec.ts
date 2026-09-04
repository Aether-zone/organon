import { HttpStatus } from '@nestjs/common';

import { BLANK_PROBLEM_TYPE, problem, titleForStatus } from './problem.js';
import { ProblemException } from './problem.exception.js';

describe('problem()', () => {
  it('defaults the type to about:blank', () => {
    expect(problem({ status: 404 }).type).toBe(BLANK_PROBLEM_TYPE);
  });

  it('titles a blank-typed problem with the status phrase', () => {
    // RFC 9457 §4.2.1: the title SHOULD be the status code's reason phrase.
    expect(problem({ status: 404 }).title).toBe('Not Found');
    expect(problem({ status: 409 }).title).toBe('Conflict');
    expect(problem({ status: 418 }).title).toBe("I'm a Teapot");
  });

  it('keeps a supplied title and type', () => {
    const document = problem({
      status: 409,
      type: 'https://example.com/probs/slug-taken',
      title: 'That slug is already in use',
    });

    expect(document.type).toBe('https://example.com/probs/slug-taken');
    expect(document.title).toBe('That slug is already in use');
  });

  it('omits detail and instance rather than emitting undefined', () => {
    const document = problem({ status: 500 });

    // `undefined` members would serialise away anyway, but their presence
    // makes `'detail' in document` lie.
    expect('detail' in document).toBe(false);
    expect('instance' in document).toBe(false);
  });

  it('puts extensions at the top level', () => {
    const document = problem({
      status: 409,
      extensions: { slug: 'acme', retryAfter: 30 },
    });

    expect(document.slug).toBe('acme');
    expect(document.retryAfter).toBe(30);
  });

  it('refuses an extension that would shadow a standard member', () => {
    expect(() => problem({ status: 400, extensions: { status: 500 } })).toThrow(
      TypeError,
    );
    expect(() => problem({ status: 400, extensions: { title: 'x' } })).toThrow(
      /standard problem member/,
    );
  });

  it('refuses a status that is not an HTTP status code', () => {
    expect(() => problem({ status: 99 })).toThrow(TypeError);
    expect(() => problem({ status: 600 })).toThrow(TypeError);
    expect(() => problem({ status: 404.5 })).toThrow(TypeError);
  });

  it('falls back to a generic title for an unknown status', () => {
    expect(titleForStatus(599)).toBe('Error');
  });
});

describe('ProblemException', () => {
  it('is an HttpException, so Nest reads its status', () => {
    const error = new ProblemException({ status: HttpStatus.CONFLICT });

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual(error.problem);
  });

  it('carries the document it renders as', () => {
    const error = new ProblemException({
      status: 403,
      type: 'https://example.com/probs/not-a-member',
      detail: 'You do not belong to that organization.',
    });

    expect(error.problem).toMatchObject({
      type: 'https://example.com/probs/not-a-member',
      title: 'Forbidden',
      status: 403,
      detail: 'You do not belong to that organization.',
    });
  });

  it('keeps a cause without exposing it in the document', () => {
    const cause = new Error('connection reset');
    const error = new ProblemException({ status: 502 }, { cause });

    expect(error.cause).toBe(cause);
    expect(JSON.stringify(error.problem)).not.toContain('connection reset');
  });
});
