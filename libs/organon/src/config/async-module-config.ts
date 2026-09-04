import {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';

/**
 * Factory-based registration options, mirroring Nest's own `registerAsync` shape.
 *
 * Modules take their configuration from a factory so they stay unaware of
 * environment variable names — the application wires those up.
 */
export interface AsyncModuleConfig<TConfig>
  extends Pick<ModuleMetadata, 'imports'> {
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  /*
   * The arguments are whatever `inject` resolves to, which is only known where
   * a module is wired — so they cannot be typed here, and `any[]` is what
   * Nest's own `registerAsync` signature uses for exactly this reason.
   */

  useFactory: (...args: any[]) => TConfig | Promise<TConfig>;
}
