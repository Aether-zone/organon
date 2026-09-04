import { actorIn } from './actor.js';
import { type Principal } from './principal.js';

const principal = (
  organizations: Principal['organizations'] = {},
): Principal => ({
  id: 'user-1',
  clientId: 'akouo',
  scopes: ['organizations'],
  organizations,
});

const acme = { role: 'admin', name: 'Acme', slug: 'acme' } as const;

describe('actorIn()', () => {
  it('narrows a member to the organization named', () => {
    const actor = actorIn(principal({ 'org-1': acme }), 'org-1');

    expect(actor).toEqual({
      id: 'user-1',
      clientId: 'akouo',
      scopes: ['organizations'],
      organizations: { 'org-1': acme },
      organizationId: 'org-1',
      role: 'admin',
      organizationName: 'Acme',
    });
  });

  it('returns null for an organization the subject does not belong to', () => {
    expect(actorIn(principal({ 'org-1': acme }), 'org-2')).toBeNull();
  });

  it('returns null when the token carries no organizations at all', () => {
    // Indistinguishable from belonging to none, and refused the same way.
    expect(actorIn(principal(), 'org-1')).toBeNull();
  });

  it('accepts a role senior to the one required', () => {
    expect(
      actorIn(principal({ 'org-1': acme }), 'org-1', 'member'),
    ).not.toBeNull();
  });

  it('refuses a role junior to the one required', () => {
    expect(actorIn(principal({ 'org-1': acme }), 'org-1', 'owner')).toBeNull();
  });

  it('requires plain membership by default', () => {
    const member = { role: 'member', name: 'Acme', slug: 'acme' } as const;

    expect(actorIn(principal({ 'org-1': member }), 'org-1')?.role).toBe(
      'member',
    );
  });

  it('does not mutate the principal it narrows', () => {
    const subject = principal({ 'org-1': acme });

    actorIn(subject, 'org-1');

    expect(subject).not.toHaveProperty('organizationId');
  });
});
