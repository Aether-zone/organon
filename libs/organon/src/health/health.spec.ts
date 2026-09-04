import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  HealthController,
  HealthControllerBase,
  HealthModule,
  HealthService,
  createHealthController,
  type HealthCheckResult,
  type HealthIndicator,
} from './index.js';

@Injectable()
class UpIndicator implements HealthIndicator {
  readonly name = 'database';
  check(): HealthCheckResult {
    return { status: 'up', latencyMs: 2 };
  }
}

@Injectable()
class DownIndicator implements HealthIndicator {
  readonly name = 'cache';
  check(): HealthCheckResult {
    return { status: 'down', error: 'connection refused' };
  }
}

@Injectable()
class ThrowingIndicator implements HealthIndicator {
  readonly name = 'bucket';
  check(): HealthCheckResult {
    throw new Error('bucket exploded');
  }
}

@Injectable()
class HangingIndicator implements HealthIndicator {
  readonly name = 'slow';
  check(): Promise<HealthCheckResult> {
    return new Promise(() => {
      /* never settles */
    });
  }
}

async function service(
  options: Parameters<typeof HealthModule.forRoot>[0] = {},
) {
  const moduleRef = await Test.createTestingModule({
    imports: [HealthModule.forRoot(options)],
  }).compile();

  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  it('reports up with no indicators at all', async () => {
    const report = await (await service()).ready();

    expect(report.status).toBe('up');
    expect(report.checks).toEqual({});
  });

  it('is up only when every indicator is', async () => {
    const up = await (await service({ indicators: [UpIndicator] })).ready();
    const mixed = await (
      await service({ indicators: [UpIndicator, DownIndicator] })
    ).ready();

    expect(up.status).toBe('up');
    expect(mixed.status).toBe('down');
  });

  it('keys each result by the indicator name and keeps its details', async () => {
    const report = await (
      await service({ indicators: [UpIndicator, DownIndicator] })
    ).ready();

    expect(report.checks).toEqual({
      database: { status: 'up', latencyMs: 2 },
      cache: { status: 'down', error: 'connection refused' },
    });
  });

  it('reports a throwing indicator as down rather than failing the report', async () => {
    // One broken check must not take the whole endpoint with it.
    const report = await (
      await service({ indicators: [UpIndicator, ThrowingIndicator] })
    ).ready();

    expect(report.status).toBe('down');
    expect(report.checks.bucket).toEqual({
      status: 'down',
      error: 'bucket exploded',
    });
    expect(report.checks.database.status).toBe('up');
  });

  it('bounds an indicator that never settles', async () => {
    const report = await (
      await service({ indicators: [HangingIndicator], timeoutMs: 20 })
    ).ready();

    expect(report.status).toBe('down');
    expect(String(report.checks.slow.error)).toMatch(/Timed out after 20ms/);
  });

  it('does not leave a pending timer behind a fast check', async () => {
    // A timer left armed keeps the event loop alive for its full duration;
    // jest would warn about it, so assert the check simply returns promptly.
    const started = Date.now();
    const report = await (
      await service({ indicators: [UpIndicator], timeoutMs: 5000 })
    ).ready();

    expect(report.status).toBe('up');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('checks nothing for liveness', async () => {
    const health = await service({ indicators: [DownIndicator] });

    // Readiness is down; liveness must still be up, or a dependency outage
    // gets the process restarted.
    expect((await health.ready()).status).toBe('down');
    expect(health.live().status).toBe('up');
    expect(health.live().checks).toEqual({});
  });

  it('reports uptime and the configured info', async () => {
    const health = await service({
      info: { service: 'test', version: '1.2.3' },
    });
    const report = health.live();

    expect(typeof report.uptime).toBe('number');
    expect(report.info).toEqual({ service: 'test', version: '1.2.3' });
  });
});

describe('createHealthController', () => {
  // Nest's own PATH_METADATA, by value: `@nestjs/common/constants` is a deep
  // import with no `exports` entry, so `nodenext` will not resolve it.
  const PATH_METADATA = 'path';

  const pathOf = (controller: unknown): unknown =>
    Reflect.getMetadata(PATH_METADATA, controller as object);

  it('mounts at /health by default', () => {
    expect(pathOf(HealthController)).toBe('health');
  });

  it('mounts where it is told', () => {
    expect(pathOf(createHealthController('internal/health'))).toBe(
      'internal/health',
    );
  });

  it('returns a fresh class each time, so one path cannot move another', () => {
    // The hazard the subclassing exists to avoid: decorating the shared base
    // would make a second registration relocate the first one's routes.
    const first = createHealthController('a');
    const second = createHealthController('b');

    expect(first).not.toBe(second);
    expect(pathOf(first)).toBe('a');
    expect(pathOf(second)).toBe('b');
    expect(pathOf(HealthController)).toBe('health');
  });

  it('resolves HealthService, so the restated constructor is doing its job', async () => {
    // Without an own constructor the subclass emits no `design:paramtypes`
    // and Nest cannot tell what to inject. Resolving it is the assertion.
    const Controller = createHealthController('ops/health');
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule.forRoot()],
      controllers: [Controller],
    }).compile();

    const controller = moduleRef.get(Controller);

    expect(controller).toBeInstanceOf(HealthControllerBase);
    // An inherited route method, working through the injected service.
    expect(controller.live().status).toBe('up');
  });
});
