/**
 * Everything a NestJS service needs in order to be a resource server for the
 * pistis authorization server.
 *
 * A separate entry point (`@aether-zone/organon/pistis-nest`) because it needs
 * passport, which a consumer wanting only problem responses or only the claim
 * vocabulary should not have to install.
 *
 * What is deliberately *not* here is anything that assumes a URL shape. An
 * organization-scoped guard has to know which path parameter names the
 * organization, and that is the consuming service's routing convention rather
 * than pistis's — `hasRole` and `membershipIn` are the pieces such a guard is
 * built from, and they are exported.
 */
export * from './auth.module.js';
export * from './auth.options.js';
export * from './decorators/index.js';
export * from './jwt/index.js';
export * from './principal.js';
export * from './claims.js';
export * from './jwks.js';
export * from './membership.js';
export * from './scope.js';
