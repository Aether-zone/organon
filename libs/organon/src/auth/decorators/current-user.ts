import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { type Principal } from '../principal.js';

/**
 * The principal the token resolved to.
 *
 * `getRequest()` is typed `any` by Nest, so the shape is narrowed here rather
 * than trusted. The cast is to `Principal` and not `Principal | undefined`
 * deliberately: the guard runs before any handler that can read this, so a
 * route reaching it without one is a wiring mistake, and a type that admitted
 * `undefined` would push a null check into every consumer to describe a state
 * that cannot occur.
 */
export const CurrentUser = createParamDecorator<unknown, Principal>(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user: Principal }>();

    return request.user;
  },
);
