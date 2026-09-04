import { HttpException } from '@nestjs/common';

import { problem, type ProblemDocument, type ProblemInit } from './problem.js';

/**
 * An error that already knows how it should be rendered.
 *
 * Extends `HttpException` deliberately rather than `Error`: everything in Nest
 * that reasons about failures — the default filter, `HttpException.getStatus`,
 * the router's status handling — understands that base class, so a
 * `ProblemException` degrades to an ordinary Nest error response if
 * {@link ProblemExceptionFilter} is not registered. It renders as a problem
 * document when it is, and as plain JSON when it is not, rather than as a 500.
 *
 * ```ts
 * throw new ProblemException({
 *   status: HttpStatus.CONFLICT,
 *   type: 'https://example.com/probs/slug-taken',
 *   title: 'That slug is already in use',
 *   detail: `"${slug}" belongs to another organization.`,
 *   extensions: { slug },
 * });
 * ```
 */
export class ProblemException extends HttpException {
  /** The document this error renders as. */
  readonly problem: ProblemDocument;

  constructor(init: ProblemInit, options?: { cause?: unknown }) {
    const document = problem(init);

    // The document is the exception's `response`, so Nest's own filter emits
    // the same body — only the content type and `instance` are lost.
    super(document, init.status, { cause: options?.cause });

    this.problem = document;
    this.name = 'ProblemException';
  }
}
