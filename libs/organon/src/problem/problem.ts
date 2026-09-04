import { STATUS_CODES } from 'node:http';

/**
 * The media type a problem document is served as (RFC 9457 §3). Serving one as
 * `application/json` is the single most common way to get this wrong: it is
 * what tells a client the body is a problem rather than the resource it asked
 * for, and generic clients branch on it.
 */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * The `type` of a problem that has no specific type (RFC 9457 §4.2.1). When
 * this is the type, the problem carries no semantics beyond its status code.
 */
export const BLANK_PROBLEM_TYPE = 'about:blank';

/**
 * A problem document, per RFC 9457 (which obsoletes RFC 7807).
 *
 * Every member except `type` is optional in the specification. They are
 * required here because a document that omits them is legal but useless, and a
 * library that makes the useless shape easy to produce is not helping.
 *
 * Extension members are allowed at the top level, which is what the index
 * signature is for. Note the trap that comes with it: an extension named
 * `status` or `title` would collide with a standard member, so
 * {@link problem} refuses those rather than letting one silently win.
 */
export interface ProblemDocument {
  /**
   * A URI reference identifying the problem *type*. Dereferencing it is not
   * required and clients must not assume it resolves — it is an identifier
   * first and documentation second.
   */
  type: string;
  /** Short, human-readable summary of the problem type. Stable across occurrences. */
  title: string;
  /** The HTTP status code, repeated here for the benefit of intermediaries. */
  status: number;
  /** Human-readable explanation specific to *this* occurrence. */
  detail?: string;
  /** URI reference identifying this specific occurrence. */
  instance?: string;
  /** Extension members. */
  [extension: string]: unknown;
}

/** The parts a caller supplies; `type` and `title` are filled in when absent. */
export interface ProblemInit {
  status: number;
  type?: string;
  title?: string;
  detail?: string;
  instance?: string;
  /**
   * Additional top-level members. Anything problem-specific goes here — a
   * field name that failed validation, a retry hint, a balance.
   */
  extensions?: Record<string, unknown>;
}

/** Members a caller may not supply as extensions, because they are standard. */
const RESERVED = ['type', 'title', 'status', 'detail', 'instance'];

/**
 * The status code's reason phrase, which RFC 9457 §4.2.1 says a blank-typed
 * problem's title SHOULD be. Read from Node rather than restated as a table
 * that would drift.
 */
export const titleForStatus = (status: number): string =>
  STATUS_CODES[status] ?? 'Error';

/**
 * Builds a problem document, applying the defaults the specification states.
 *
 * @throws TypeError when an extension member would shadow a standard one, or
 * when the status is not a valid HTTP status code. Both are programming
 * mistakes that would otherwise surface as a subtly wrong response body.
 */
export function problem(init: ProblemInit): ProblemDocument {
  if (
    !Number.isInteger(init.status) ||
    init.status < 100 ||
    init.status > 599
  ) {
    throw new TypeError(
      `A problem's status must be an HTTP status code, not ${String(init.status)}.`,
    );
  }

  const extensions = init.extensions ?? {};

  for (const key of Object.keys(extensions)) {
    if (RESERVED.includes(key)) {
      throw new TypeError(
        `"${key}" is a standard problem member and cannot be used as an extension.`,
      );
    }
  }

  const type = init.type ?? BLANK_PROBLEM_TYPE;

  return {
    ...extensions,
    type,
    // A blank type means the status code is the whole of the semantics, so its
    // reason phrase is the only honest title.
    title: init.title ?? titleForStatus(init.status),
    status: init.status,
    ...(init.detail === undefined ? {} : { detail: init.detail }),
    ...(init.instance === undefined ? {} : { instance: init.instance }),
  };
}
