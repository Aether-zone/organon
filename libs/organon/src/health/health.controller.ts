import { Controller, Get, HttpStatus, Res, type Type } from '@nestjs/common';

import { Public } from '../auth/decorators/public.js';
import { type HealthReport } from './health-indicator.js';
import { HealthService } from './health.service.js';

/** The half of a platform response object this controller needs. */
interface StatusfulResponse {
  status?: (code: number) => unknown;
  code?: (code: number) => unknown;
}

/**
 * The routes, with no path of their own.
 *
 * `@Controller()` is evaluated when the class is defined, so a path chosen at
 * module-registration time cannot be given to it. The decorator is therefore
 * left off here and applied to a subclass by {@link createHealthController}.
 *
 * | Route | Question | Checks dependencies |
 * | --- | --- | --- |
 * | `GET <path>/live` | Is the process running? | no |
 * | `GET <path>/ready` | Can it serve traffic? | yes |
 * | `GET <path>` | — | yes, same as `/ready` |
 *
 * **Liveness deliberately checks nothing.** A liveness probe answers "should
 * this process be restarted", and restarting a healthy process because the
 * database it talks to went down turns one outage into two — the restarts
 * remove capacity exactly when the dependency recovers and the load arrives.
 * Dependencies belong in readiness, which takes the instance out of the load
 * balancer and puts it back when they return.
 *
 * Both are `@Public()`, so a global token guard does not apply: an
 * orchestrator has no credentials, and a health endpoint behind authentication
 * reports every instance as unhealthy.
 *
 * The report is returned rather than thrown, so a failure and a success have
 * the same shape. It deliberately does not go through `ProblemExceptionFilter`:
 * a 503 from readiness is an expected operational signal rather than an error,
 * and the report's own `status` field would collide with the problem
 * document's.
 */
export class HealthControllerBase {
  constructor(protected readonly health: HealthService) {}

  @Public()
  @Get('live')
  live(): HealthReport {
    return this.health.live();
  }

  @Public()
  @Get()
  root(@Res({ passthrough: true }) response: unknown): Promise<HealthReport> {
    return this.ready(response);
  }

  @Public()
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) response: unknown,
  ): Promise<HealthReport> {
    const report = await this.health.ready();

    if (report.status === 'down') {
      setStatus(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}

/**
 * A health controller mounted at `path`.
 *
 * A fresh subclass each call, never a decorator applied to the shared base:
 * `@Controller` writes the path onto the class it decorates, so mutating the
 * base would make a second `HealthModule.forRoot()` silently move the first
 * one's routes.
 *
 * The constructor is restated rather than inherited on purpose. TypeScript
 * emits `design:paramtypes` only for a class that declares its own
 * constructor, and without that metadata Nest cannot tell what to inject —
 * the subclass would fail to resolve `HealthService`.
 */
export function createHealthController(
  path = 'health',
): Type<HealthControllerBase> {
  @Controller(path)
  class HealthController extends HealthControllerBase {
    constructor(health: HealthService) {
      super(health);
    }
  }

  return HealthController;
}

/** The default controller, mounted at `/health`. */
export const HealthController = createHealthController();

/**
 * `passthrough: true` leaves Nest to serialise the returned body, so only the
 * status code is set here. Express spells it `status`, Fastify `code`; neither
 * is assumed to be present.
 */
function setStatus(response: unknown, code: number): void {
  if (response === null || typeof response !== 'object') {
    return;
  }

  const target = response as StatusfulResponse;

  if (typeof target.status === 'function') {
    target.status(code);
  } else if (typeof target.code === 'function') {
    target.code(code);
  }
}
