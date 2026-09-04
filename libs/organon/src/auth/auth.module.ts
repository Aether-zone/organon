import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import {
  AUTH_OPTIONS,
  withAuthDefaults,
  type AsyncModuleConfig,
  type PistisAuthConfig,
} from './auth.options.js';
import { PistisJwtAuthGuard, PistisJwtStrategy } from './jwt/index.js';

/**
 * Makes a NestJS service a resource server for the pistis authorization server.
 *
 * There is nothing to sign in *to* here: a resource server issues no tokens,
 * stores no passwords and keeps no user table. It accepts bearer tokens pistis
 * minted, and `@Public()` opts a route out. Signing in happens in whatever web
 * app runs the authorization code flow against pistis.
 */
@Module({})
export class PistisAuthModule {
  static register(config: PistisAuthConfig): DynamicModule {
    return PistisAuthModule.registerAsync({ useFactory: () => config });
  }

  static registerAsync(
    options: AsyncModuleConfig<PistisAuthConfig>,
  ): DynamicModule {
    const { imports = [], inject = [], useFactory } = options;

    return {
      module: PistisAuthModule,
      imports: [PassportModule, ...(imports as never[])],
      providers: [
        {
          provide: AUTH_OPTIONS,
          useFactory: async (...args: never[]) =>
            withAuthDefaults(await useFactory(...args)),
          inject: inject as never[],
        },
        PistisJwtStrategy,
        {
          provide: APP_GUARD,
          useClass: PistisJwtAuthGuard,
        },
      ],
      exports: [AUTH_OPTIONS, PistisJwtStrategy],
    };
  }
}
