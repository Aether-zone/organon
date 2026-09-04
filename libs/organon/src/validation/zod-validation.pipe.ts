import {
  ArgumentMetadata,
  HttpStatus,
  Paramtype,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

import { ProblemException } from '../problem/problem.exception.js';

/** One thing that was wrong with the input. */
export interface ValidationIssue {
  /**
   * Where it was wrong, as a path a client can act on: `email`,
   * `members[0].role`. Empty for an issue about the value as a whole.
   */
  path: string;
  message: string;
  /** zod's own issue code — `invalid_type`, `too_small`, and so on. */
  code: string;
}

export interface ZodValidationOptions {
  /** Overrides the problem `type`. Defaults to `about:blank`. */
  type?: string;
  /** Overrides the problem `title`. Defaults to the status reason phrase. */
  title?: string;
  /** Overrides the generated `detail`, which otherwise names the argument. */
  detail?: string;
  /** Defaults to 400. Use 422 if that is the convention in your service. */
  status?: number;
}

/** `items` and `0` become `items[0]`; `a` and `b` become `a.b`. */
export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') {
      return `${formatted}[${segment}]`;
    }

    const key = String(segment);

    return formatted === '' ? key : `${formatted}.${key}`;
  }, '');
}

/** What Nest calls the argument, for a `detail` that says where to look. */
const describe = (type: Paramtype): string =>
  ({
    body: 'The request body is not valid.',
    query: 'The query string is not valid.',
    param: 'A path parameter is not valid.',
    custom: 'The request is not valid.',
  })[type] ?? 'The request is not valid.';

/**
 * Validates an argument against a zod schema, and reports a failure as an
 * RFC 9457 problem document.
 *
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserDTO) {}
 * ```
 *
 * Prefer that per-argument form over `@UsePipes()`. A pipe registered on the
 * handler runs against *every* argument — the body, each path parameter, the
 * query — and one schema cannot describe all of them, so the first parameter
 * it reaches fails validation against a schema written for the body.
 *
 * The pipe returns the schema's **output**, so defaults, coercions and
 * transforms are applied rather than validated and thrown away. Coercion is
 * what makes it usable on a query string, where every value arrives as text.
 *
 * Failures carry an `errors` extension: one entry per broken rule, with the
 * path it was broken at, because a client marking up form fields needs them
 * apart rather than joined into a sentence.
 */
export class ZodValidationPipe<
  TOutput,
  TInput = unknown,
> implements PipeTransform<TInput, Promise<TOutput>> {
  constructor(
    private readonly schema: ZodType<TOutput, TInput>,
    private readonly options: ZodValidationOptions = {},
  ) {}

  /**
   * `safeParseAsync` rather than `safeParse`: a schema carrying an async
   * refinement throws outright under the synchronous call, and a pipe is
   * allowed to return a promise, so there is nothing to trade away.
   */
  async transform(value: TInput, metadata: ArgumentMetadata): Promise<TOutput> {
    const result = await this.schema.safeParseAsync(value);

    if (result.success) {
      return result.data;
    }

    const errors: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
      code: issue.code,
    }));

    throw new ProblemException(
      {
        status: this.options.status ?? HttpStatus.BAD_REQUEST,
        type: this.options.type,
        title: this.options.title,
        detail: this.options.detail ?? describe(metadata.type),
        extensions: { errors },
      },
      // Kept for a logger or an error tracker; the document itself carries
      // only what a client can act on.
      { cause: result.error },
    );
  }
}
