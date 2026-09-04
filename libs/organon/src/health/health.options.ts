import type { ModuleMetadata, Type } from '@nestjs/common';

import type { HealthIndicator } from './health-indicator.js';

export const HEALTH_OPTIONS = 'ORGANON_HEALTH_OPTIONS';

export interface HealthModuleOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Where the endpoints are mounted. Defaults to `health`, giving `/health`,
   * `/health/live` and `/health/ready`.
   *
   * This replaces the prefix rather than adding to one. To keep `health` under
   * a wider prefix instead, leave this alone and use Nest's `RouterModule`:
   *
   * ```ts
   * RouterModule.register([{ path: 'internal', module: HealthModule }])
   * ```
   */
  path?: string;
  /**
   * Indicators to run for readiness. Each is provided by this module, so an
   * indicator with dependencies of its own needs the module supplying those in
   * `imports`.
   */
  indicators?: Type<HealthIndicator>[];
  /** How long any one indicator may take. Defaults to 3000ms. */
  timeoutMs?: number;
  /** Reported as-is — a service name, a version, a commit. */
  info?: Record<string, unknown>;
}

export interface ResolvedHealthOptions extends HealthModuleOptions {
  path: string;
  timeoutMs: number;
}

export const withHealthDefaults = (
  options: HealthModuleOptions = {},
): ResolvedHealthOptions => ({
  ...options,
  path: options.path ?? 'health',
  timeoutMs: options.timeoutMs ?? 3000,
});
