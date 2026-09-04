import { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';

import { ProblemException } from '../problem/problem.exception.js';
import {
  formatIssuePath,
  ZodValidationPipe,
  type ValidationIssue,
} from './zod-validation.pipe.js';

const body: ArgumentMetadata = {
  type: 'body',
  metatype: undefined,
  data: undefined,
};
const query: ArgumentMetadata = {
  type: 'query',
  metatype: undefined,
  data: undefined,
};

/** Runs the pipe and returns the problem it threw. */
async function reject(
  pipe: ZodValidationPipe<unknown>,
  value: unknown,
  metadata: ArgumentMetadata = body,
) {
  try {
    await pipe.transform(value, metadata);
  } catch (error) {
    if (error instanceof ProblemException) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected the pipe to reject.');
}

describe('formatIssuePath', () => {
  it('renders array indices as brackets and keys as dots', () => {
    expect(formatIssuePath(['members', 0, 'role'])).toBe('members[0].role');
    expect(formatIssuePath(['email'])).toBe('email');
    expect(formatIssuePath([])).toBe('');
  });
});

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.email(),
    age: z.number().int().min(18),
  });

  it('returns the parsed value when it is valid', async () => {
    const pipe = new ZodValidationPipe(schema);

    await expect(
      pipe.transform({ email: 'a@b.com', age: 30 }, body),
    ).resolves.toEqual({ email: 'a@b.com', age: 30 });
  });

  it('returns the schema output, so defaults and coercions survive', async () => {
    // The point of returning `data` rather than the input: a query string
    // arrives as text, and a validated-then-discarded coercion is useless.
    const pipe = new ZodValidationPipe(
      z.object({
        page: z.coerce.number().default(1),
        perPage: z.coerce.number().default(20),
      }),
    );

    await expect(pipe.transform({ page: '3' }, query)).resolves.toEqual({
      page: 3,
      perPage: 20,
    });
  });

  it('throws a ProblemException the filter already knows how to render', async () => {
    const problem = await reject(new ZodValidationPipe(schema), {
      email: 'nope',
      age: 12,
    });

    expect(problem.getStatus()).toBe(400);
    expect(problem.problem).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'The request body is not valid.',
    });
  });

  it('reports one structured issue per broken rule', async () => {
    const problem = await reject(new ZodValidationPipe(schema), {
      email: 'nope',
      age: 12,
    });
    const errors = problem.problem.errors as ValidationIssue[];

    expect(errors).toHaveLength(2);
    expect(errors.map((issue) => issue.path).sort()).toEqual(['age', 'email']);
    expect(errors.every((issue) => typeof issue.code === 'string')).toBe(true);
  });

  it('paths nested and indexed fields so a client can mark them up', async () => {
    const pipe = new ZodValidationPipe(
      z.object({
        members: z.array(z.object({ role: z.enum(['owner', 'member']) })),
      }),
    );

    const problem = await reject(pipe, {
      members: [{ role: 'owner' }, { role: 'nope' }],
    });
    const errors = problem.problem.errors as ValidationIssue[];

    expect(errors[0].path).toBe('members[1].role');
  });

  it('names the argument it was validating', async () => {
    const problem = await reject(new ZodValidationPipe(schema), {}, query);

    expect(problem.problem.detail).toBe('The query string is not valid.');
  });

  it('takes a problem type, title, detail and status', async () => {
    const pipe = new ZodValidationPipe(schema, {
      type: 'https://example.com/probs/invalid-user',
      title: 'That user is not valid',
      detail: 'Check the highlighted fields.',
      status: 422,
    });

    const problem = await reject(pipe, {});

    expect(problem.getStatus()).toBe(422);
    expect(problem.problem).toMatchObject({
      type: 'https://example.com/probs/invalid-user',
      title: 'That user is not valid',
      detail: 'Check the highlighted fields.',
      status: 422,
    });
  });

  it('keeps the ZodError as the cause without leaking it into the document', async () => {
    const problem = await reject(new ZodValidationPipe(schema), {});

    expect(problem.cause).toBeInstanceOf(z.ZodError);
    // The document carries only what a client can act on.
    expect(JSON.stringify(problem.problem)).not.toContain('ZodError');
  });

  it('supports a schema with an async refinement', async () => {
    // `safeParse` would throw outright on this; `safeParseAsync` is why it works.
    const taken = new Set(['taken@example.com']);
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.email().refine(async (value) => {
          // A real check would be a query. The await is what actually makes
          // the schema async, which is the thing under test: `safeParse`
          // throws on a schema like this, `safeParseAsync` does not.
          await Promise.resolve();

          return !taken.has(value);
        }, 'That address is already registered'),
      }),
    );

    await expect(
      pipe.transform({ email: 'free@example.com' }, body),
    ).resolves.toEqual({ email: 'free@example.com' });

    const problem = await reject(pipe, { email: 'taken@example.com' });
    const errors = problem.problem.errors as ValidationIssue[];

    expect(errors[0].message).toBe('That address is already registered');
  });
});
