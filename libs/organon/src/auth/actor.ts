import { type MembershipRole } from './membership.js';
import { hasRole, membershipIn, type Principal } from './principal.js';

/**
 * A principal acting inside one organization.
 *
 * {@link Principal} says who the caller is and everywhere they *could* act;
 * an `Actor` narrows that to a single organization, with the role they hold
 * there. A service that takes an `Actor` rather than a `Principal` and an id
 * cannot filter a query by the wrong organization: there is only one to reach
 * for.
 */
export interface Actor extends Principal {
  /** The organization this actor was narrowed to, which the caller belongs to. */
  organizationId: string;
  /** The caller's role in that organization, per the token's `orgs` claim. */
  role: MembershipRole;
  /**
   * The organization's name as pistis stated it when the token was issued.
   * Display only — it is as stale as the token, and nothing should key on it.
   */
  organizationName: string;
}

/**
 * Narrows a principal to one organization, or returns null when they may not
 * act in it at `atLeast`.
 *
 * The check is against the token's `orgs` claim and nothing else — no query, no
 * call back to pistis. That is the point of putting memberships in the token,
 * and it is why the claim's staleness is the whole exposure: someone removed
 * from an organization keeps access until their client refreshes.
 *
 * Null rather than an exception, because which status a refusal deserves is the
 * caller's decision — a guard turns this into a 403, while a view rendering an
 * organization switcher just skips the entry. Null also deliberately conflates
 * "not a member" with "member, but not senior enough": a caller that answered
 * those differently would be telling an outsider which organizations exist.
 * `membershipIn` and `roleIn` are still there for one that genuinely needs to
 * tell them apart.
 *
 * Where the organization id *comes from* is the caller's business too. This
 * takes it as an argument precisely so that nothing here has to assume a URL
 * shape: which path parameter names the organization is a routing convention,
 * and it belongs to the service that owns the routes.
 */
export const actorIn = (
  principal: Principal,
  organizationId: string,
  atLeast: MembershipRole = 'member',
): Actor | null => {
  if (!hasRole(principal, organizationId, atLeast)) {
    return null;
  }

  // Non-null: hasRole returned true, which requires a membership.
  const membership = membershipIn(principal, organizationId)!;

  return {
    ...principal,
    organizationId,
    role: membership.role,
    organizationName: membership.name,
  };
};
