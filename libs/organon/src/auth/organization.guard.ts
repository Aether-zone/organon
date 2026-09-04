import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { actorIn } from './actor.js';
import { type MembershipRole } from './membership.js';
import { type Principal } from './principal.js';
import { ORGANIZATION_ROLE_KEY } from './decorators/require-role.js';

/**
 * The path parameter an organization-scoped route names its organization with,
 * unless a service says otherwise through {@link organizationGuardFor}.
 *
 * A default is not the same as an assumption: which parameter carries the
 * organization is still the consuming service's decision, and this is only the
 * answer most of them would give.
 */
export const ORGANIZATION_PARAM = 'organizationId';

/** Where the guard leaves the narrowed principal for `@CurrentActor()`. */
export const ACTOR_KEY = 'actor';

/**
 * Refuses a request that names an organization the caller may not act in, and
 * narrows the principal to an {@link Actor} for the rest of it.
 *
 * The check is against the `orgs` claim of the pistis token and nothing else —
 * no query, no call back to pistis. That is the point of putting memberships in
 * the token, and it is why the claim's staleness is the whole exposure: someone
 * removed from an organization keeps access until their client refreshes.
 *
 * An unknown organization and someone else's give the same 403 deliberately. A
 * 404 for one and a 403 for the other would answer "does this organization
 * exist" for anyone who cared to ask.
 *
 * Injects nothing but `Reflector`, which Nest provides everywhere, so a module
 * declaring an organization-scoped controller needs to import nothing to use
 * it — `@UseGuards(OrganizationGuard)` is the whole of the wiring.
 */
export function organizationGuardFor(param: string): Type<CanActivate> {
  @Injectable()
  class OrganizationGuardMixin implements CanActivate {
    constructor(readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
      const request = context
        .switchToHttp()
        .getRequest<{ params?: Record<string, unknown>; user?: Principal }>();

      const organizationId: unknown = request.params?.[param];
      const principal = request.user;

      if (typeof organizationId !== 'string' || organizationId.length === 0) {
        // The guard is on a route with no organization in its path. That is a
        // wiring mistake, and failing closed is the only safe reading of it.
        throw new ForbiddenException(`This route names no ${param}.`);
      }

      if (!principal) {
        throw new ForbiddenException('No authenticated principal.');
      }

      const required =
        this.reflector.getAllAndOverride<MembershipRole>(
          ORGANIZATION_ROLE_KEY,
          [context.getHandler(), context.getClass()],
        ) ?? 'member';

      const actor = actorIn(principal, organizationId, required);

      if (!actor) {
        throw new ForbiddenException(
          'You do not have access to this organization.',
        );
      }

      (request as Record<string, unknown>)[ACTOR_KEY] = actor;

      return true;
    }
  }

  return mixin(OrganizationGuardMixin);
}

/**
 * The guard for the {@link ORGANIZATION_PARAM} convention, which is what a
 * service routing `/organizations/:organizationId/...` wants.
 *
 * Built once here rather than per call site: `mixin` produces a fresh class
 * each time, and Nest caches guard instances per class, so calling the factory
 * inside `@UseGuards()` would make a new one for every decorated controller.
 */
export const OrganizationGuard = organizationGuardFor(ORGANIZATION_PARAM);
