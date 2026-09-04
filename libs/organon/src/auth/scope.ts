/**
 * OAuth puts scopes on the wire as a single space-delimited string
 * (RFC 6749 §3.3). Both ends of a token exchange have to agree on that, so the
 * two functions live here rather than with pistis's own scope catalogue —
 * which scopes *exist* is the authorization server's business, but reading the
 * claim is every resource server's.
 */
export function parseScope(scope: string | undefined | null): string[] {
  if (!scope) {
    return [];
  }

  return [...new Set(scope.split(' ').filter((value) => value.length > 0))];
}

export function formatScope(scopes: readonly string[]): string {
  return scopes.join(' ');
}
