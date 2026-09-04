import { z } from 'zod';

import { membershipRoleSchema } from './membership.js';

/**
 * One entry of the `orgs` claim: what the subject may do in an organization,
 * and enough to name it on screen.
 *
 * `name` is display only, and a resource server must treat it that way — a
 * rename is not visible to an already-issued token, while `role` is the fact
 * every access decision turns on. Keeping both here is what saves every client
 * from a second request just to render a switcher.
 */
export const organizationMembershipClaimSchema = z.object({
  role: membershipRoleSchema,
  name: z.string(),
  slug: z.string(),
});

/**
 * Claims of a JWT access token, per RFC 9068 §2.2. `sub` is the resource
 * owner for a user-delegated token and the client itself for the client
 * credentials grant; `jti` is what ties the token back to its database row,
 * which is what makes revocation possible for an otherwise self-contained
 * credential.
 */
export const accessTokenClaimsSchema = z.object({
  iss: z.string(),
  sub: z.string(),
  aud: z.string(),
  exp: z.number(),
  iat: z.number(),
  jti: z.string(),
  client_id: z.string(),
  scope: z.string(),
  /**
   * Every organization the subject belongs to, keyed by id, with their role —
   * present only when the `organizations` scope was granted, and never for the
   * client credentials grant, where the subject is a client and belongs to
   * nothing.
   *
   * A resource server reads this to decide whether a request may act in the
   * organization it names, without asking this server. The cost of that is
   * staleness: a membership revoked here keeps working until the token
   * expires. pistis resolves the map afresh on every issue, including the
   * refresh grant, so a refresh is what catches a client up.
   */
  orgs: z.record(z.string(), organizationMembershipClaimSchema).optional(),
});

/** What `/oauth/userinfo` returns, given a token carrying the `profile` scope. */
export const userInfoSchema = z.object({
  sub: z.uuid(),
  name: z.string(),
  email: z.email(),
  updated_at: z.number(),
});

export type OrganizationMembershipClaim = z.infer<
  typeof organizationMembershipClaimSchema
>;
export type AccessTokenClaimsDTO = z.infer<typeof accessTokenClaimsSchema>;
export type UserInfoDTO = z.infer<typeof userInfoSchema>;
