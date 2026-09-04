import { roleIsAtLeast, type MembershipRole } from './membership.js';
import { type OrganizationMembershipClaim } from './claims.js';

/**
 * Who a request is acting as, resolved from a pistis access token.
 *
 * `id` is the token's `sub`: the resource owner for a user-delegated token, and
 * the client itself for one issued through the client credentials grant. It is
 * the only identity a resource server needs to keep — names and email addresses
 * live in pistis.
 */
export interface Principal {
  id: string;
  /** `client_id` claim: which registered client the token was issued to. */
  clientId: string;
  /** Granted scopes, already split out of the space-delimited `scope` claim. */
  scopes: string[];
  /**
   * Organizations the subject belongs to, keyed by id, with their role — the
   * `orgs` claim. Empty when the token was issued without the `organizations`
   * scope, which is indistinguishable here from belonging to none: either way
   * the request may act in no organization at all.
   */
  organizations: Record<string, OrganizationMembershipClaim>;
}

/** True when the token carries every scope named. */
export const hasScopes = (
  principal: Principal,
  ...required: string[]
): boolean => required.every((scope) => principal.scopes.includes(scope));

/** The subject's membership of an organization, or null when they have none. */
export const membershipIn = (
  principal: Principal,
  organizationId: string,
): OrganizationMembershipClaim | null =>
  principal.organizations[organizationId] ?? null;

/** The subject's role in an organization, or null when they are not a member. */
export const roleIn = (
  principal: Principal,
  organizationId: string,
): MembershipRole | null =>
  membershipIn(principal, organizationId)?.role ?? null;

/**
 * True when the subject holds at least `atLeast` in the organization.
 *
 * The ordering itself comes from `@aether-zone/organon/pistis`, which is
 * where pistis states it — a resource server ranking roles for itself is how
 * the two ends drift.
 */
export const hasRole = (
  principal: Principal,
  organizationId: string,
  atLeast: MembershipRole,
): boolean => {
  const role = roleIn(principal, organizationId);

  return role !== null && roleIsAtLeast(role, atLeast);
};
