/**
 * The JSON-LD shapes aether-zone exchanges resources in.
 *
 * Types only — no parser, no mapper, no validator. What makes a document worth
 * having in a shared library is that two services agree on the same shape; how
 * either of them turns one into a graph, or checks it, is theirs.
 *
 * The spec allows far more than this: a context can be a URL or an array, a
 * value can carry `@value`/`@language`, `@graph` can hold many subjects. This
 * is the subset aether-zone actually emits, and widening it is a decision to
 * take when something needs the rest — not in advance.
 */

/**
 * A term-to-IRI map.
 *
 * The inline object form only. A remote context — `"@context":
 * "https://schema.org"` — would have to be fetched before a document could be
 * read, which turns every consumer into an HTTP client and every producer into
 * a dependency.
 */
export type JsonLdContext = {
  [term: string]: string;
};

/**
 * One resource.
 *
 * `@id` is required rather than optional, which is stricter than JSON-LD: a
 * blank node is legal in the spec and useless here, because a resource nothing
 * can name is a resource nothing can relate to or fetch again.
 *
 * The index signature is what lets a domain type extend this and add its own
 * properties — see how a consumer declares one below.
 *
 * @example
 * ```ts
 * interface Person extends JsonLdDocument {
 *   '@type': 'Person';
 *   name: string;
 *   organization?: JsonLdReference;
 * }
 * ```
 */
export interface JsonLdDocument {
  '@context': JsonLdContext;
  '@id': string;
  '@type': string | string[];
  [property: string]: unknown;
}

/**
 * A pointer to a resource described elsewhere.
 *
 * `{ '@id': … }` and nothing else. The single key is load-bearing: it is how a
 * reader tells "this property points at that resource" from "this property
 * holds a nested resource", which are the same JSON otherwise.
 */
export interface JsonLdReference {
  '@id': string;
}
