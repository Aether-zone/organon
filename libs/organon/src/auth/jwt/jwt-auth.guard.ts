import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.js';

/**
 * Requires a valid pistis access token on every route, unless `@Public()` says
 * otherwise.
 *
 * Registered as an `APP_GUARD` by `PistisAuthModule`, so the default is closed:
 * a new controller is authenticated because nobody did anything, which is the
 * only default worth having.
 */
@Injectable()
export class PistisJwtAuthGuard extends AuthGuard('pistis-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
