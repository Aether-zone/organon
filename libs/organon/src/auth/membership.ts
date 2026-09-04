import { z } from 'zod';

/**
 * Roles are ordered by authority: an `owner` can do anything, an `admin` can
 * manage members but not owners, a `member` only belongs.
 *
 * This is the vocabulary a resource server has to agree with pistis on, which
 * is why it lives here rather than beside the membership DTOs — those describe
 * pistis's own admin API and mean nothing to a token holder.
 */
export const membershipRoleSchema = z.enum(['owner', 'admin', 'member']);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;

/**
 * Roles by authority, so a check can ask for "admin or better" rather than
 * enumerating every role that qualifies.
 *
 * Exported as data rather than kept behind a comparison function because a
 * resource server that renders a role picker needs the ordering too.
 */
export const ROLE_AUTHORITY: Record<MembershipRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/** True when `role` carries at least the authority of `atLeast`. */
export const roleIsAtLeast = (
  role: MembershipRole,
  atLeast: MembershipRole,
): boolean => ROLE_AUTHORITY[role] >= ROLE_AUTHORITY[atLeast];
