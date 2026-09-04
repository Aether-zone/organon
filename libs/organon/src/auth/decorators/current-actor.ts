import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import { type Actor } from '../actor.js';
import { ACTOR_KEY } from '../organization.guard.js';

/**
 * The caller, narrowed to the organization the request named.
 *
 * Throws rather than returning undefined when `OrganizationGuard` has not run:
 * a handler reading this without the guard would be doing unscoped work on
 * behalf of an unchecked caller, and a 500 is the right answer to a route wired
 * that way. Contrast `@CurrentUser()`, which needs no such check because its
 * guard is global.
 */
export const CurrentActor = createParamDecorator<unknown, Actor>(
  (_data: unknown, context: ExecutionContext) => {
    const actor: Actor | undefined = context
      .switchToHttp()
      .getRequest<Record<string, Actor | undefined>>()[ACTOR_KEY];

    if (!actor) {
      throw new InternalServerErrorException(
        'This route is missing OrganizationGuard.',
      );
    }

    return actor;
  },
);
