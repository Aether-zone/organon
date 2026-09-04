import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** What is carried alongside a request for the length of its handling. */
export interface RequestContext {
  requestId: string;
}

/**
 * Where the current request's context lives.
 *
 * `AsyncLocalStorage` rather than a parameter threaded through every call: the
 * whole value of a request id is that code which knows nothing about it — a
 * repository, a mapper, a third-party callback — still writes it. Passing it
 * explicitly would mean every function that might one day log growing an
 * argument it otherwise has no use for.
 */
const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `work` with `context` in scope, including everything it awaits. */
export const runWithRequestContext = <T>(
  context: RequestContext,
  work: () => T,
): T => storage.run(context, work);

/** The current context, or undefined outside a request — during boot, say. */
export const currentRequestContext = (): RequestContext | undefined =>
  storage.getStore();

/** The current request id, or undefined outside a request. */
export const currentRequestId = (): string | undefined =>
  storage.getStore()?.requestId;

/**
 * Where the id is also written on the request object.
 *
 * The async store is not enough on its own: an exception filter runs outside
 * the interceptor chain, so it cannot rely on being inside the `run` call, and
 * it is handed the request rather than the context. Keeping both means the
 * filter can always name the id in the problem document it returns.
 */
export const REQUEST_ID_PROPERTY = '__organonRequestId';

/** Reads the id off a request object, whatever platform it came from. */
export function requestIdOf(request: unknown): string | undefined {
  if (request === null || typeof request !== 'object') {
    return undefined;
  }

  const value = (request as Record<string, unknown>)[REQUEST_ID_PROPERTY];

  return typeof value === 'string' ? value : undefined;
}

/** A fresh request id. Exported so a consumer can supply its own scheme. */
export const newRequestId = (): string => randomUUID();
