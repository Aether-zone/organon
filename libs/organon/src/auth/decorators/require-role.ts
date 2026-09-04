import { SetMetadata } from '@nestjs/common';

import { type MembershipRole } from '../membership.js';

export const ORGANIZATION_ROLE_KEY = 'organon:organizationRole';

/**
 * The least authoritative role a route accepts, read by `OrganizationGuard`.
 *
 * Absent, the guard requires plain membership, which is the right default:
 * every route under an organization is at minimum members-only, so the
 * undecorated case is the closed one.
 */
export const RequireRole = (role: MembershipRole) =>
  SetMetadata(ORGANIZATION_ROLE_KEY, role);
