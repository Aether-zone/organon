/**
 * Everything a NestJS service needs in order to be a resource server for the
 * pistis authorization server.
 *
 * That includes the organization-scoped half: `OrganizationGuard`, the
 * `@CurrentActor()` and `@RequireRole()` decorators it reads, and the `Actor`
 * they hand a handler.
 *
 * This is why passport is a *required* peer of the package rather than an
 * optional one: the root barrel re-exports this folder, which imports passport
 * as a value, so requiring the package requires passport even for a consumer
 * that only wants a problem filter. Giving this folder its own entry point
 * would buy that back.
 *
 * This folder once held that a guard could not live here, because it has to
 * know which path parameter names the organization, and that is the consuming
 * service's routing convention rather than pistis's. What that argument
 * actually rules out is *hard-coding* the parameter, not shipping the guard:
 * `organizationGuardFor` takes the name, and `OrganizationGuard` is the
 * `:organizationId` convention most services would pick anyway. Every service
 * writing the same guard against `actorIn` was the worse outcome.
 */
export * from './auth.module.js';
export * from './auth.options.js';
export * from './decorators/index.js';
export * from './jwt/index.js';
export * from './principal.js';
export * from './actor.js';
export * from './organization.guard.js';
export * from './claims.js';
export * from './jwks.js';
export * from './membership.js';
export * from './scope.js';
