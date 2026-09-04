import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type Actor } from './actor.js';
import { type MembershipRole } from './membership.js';
import { type Principal } from './principal.js';
import {
  ACTOR_KEY,
  OrganizationGuard,
  organizationGuardFor,
} from './organization.guard.js';

const acme = { role: 'admin', name: 'Acme', slug: 'acme' } as const;

const principal = (
  organizations: Principal['organizations'] = { 'org-1': acme },
): Principal => ({
  id: 'user-1',
  clientId: 'akouo',
  scopes: ['organizations'],
  organizations,
});

/** A request the guard can read, and which it leaves the actor on. */
function harness({
  params = { organizationId: 'org-1' },
  user = principal(),
  required,
}: {
  params?: Record<string, unknown>;
  /** null for a request no strategy left a principal on. */
  user?: Principal | null;
  required?: MembershipRole;
} = {}) {
  const request: Record<string, unknown> = { params, user: user ?? undefined };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;

  return { request, context, reflector };
}

describe('OrganizationGuard', () => {
  it('admits a member and leaves an actor on the request', () => {
    const { request, context, reflector } = harness();

    expect(new OrganizationGuard(reflector).canActivate(context)).toBe(true);

    expect(request[ACTOR_KEY]).toMatchObject<Partial<Actor>>({
      id: 'user-1',
      organizationId: 'org-1',
      role: 'admin',
      organizationName: 'Acme',
    });
  });

  it('refuses an organization the caller does not belong to', () => {
    const { context, reflector } = harness({
      params: { organizationId: 'org-2' },
    });

    expect(() => new OrganizationGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a role junior to the one @RequireRole asked for', () => {
    const { context, reflector } = harness({ required: 'owner' });

    expect(() => new OrganizationGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('admits a role senior to the one required', () => {
    const { context, reflector } = harness({ required: 'member' });

    expect(new OrganizationGuard(reflector).canActivate(context)).toBe(true);
  });

  it('fails closed on a route whose path names no organization', () => {
    const { context, reflector } = harness({ params: {} });

    expect(() => new OrganizationGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('fails closed when no principal reached it', () => {
    const { context, reflector } = harness({ user: null });

    expect(() => new OrganizationGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('tells an outsider nothing an unknown organization would not', () => {
    // Both refusals must read the same, or the message answers "does this
    // organization exist" for anyone who cared to ask.
    const stranger = harness({ params: { organizationId: 'org-2' } });
    const junior = harness({ required: 'owner' });

    const messageFrom = (h: ReturnType<typeof harness>) => {
      try {
        void new OrganizationGuard(h.reflector).canActivate(h.context);
      } catch (error) {
        return (error as ForbiddenException).message;
      }
      return null;
    };

    expect(messageFrom(stranger)).toBe(messageFrom(junior));
  });
});

describe('organizationGuardFor()', () => {
  it('reads the parameter it was given instead of the default', () => {
    const Guard = organizationGuardFor('tenantId');
    const { request, context, reflector } = harness({
      params: { tenantId: 'org-1' },
    });

    expect(new Guard(reflector).canActivate(context)).toBe(true);
    expect(request[ACTOR_KEY]).toMatchObject({ organizationId: 'org-1' });
  });

  it('ignores the default parameter once another is named', () => {
    const Guard = organizationGuardFor('tenantId');
    const { context, reflector } = harness({
      params: { organizationId: 'org-1' },
    });

    expect(() => new Guard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });
});
