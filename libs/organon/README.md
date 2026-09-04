# @aether-zone/organon

A NestJS library.

```sh
pnpm add @aether-zone/organon
```

```ts
import { Module } from '@nestjs/common';
import { OrganonModule } from '@aether-zone/organon';

@Module({ imports: [OrganonModule] })
export class AppModule {}
```

## Errors as Problem JSON

`ProblemException` is an error that already knows how it renders;
`ProblemExceptionFilter` renders every failure — not just that one — as an
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document, served as
`application/problem+json`.

```ts
import { APP_FILTER } from '@nestjs/core';
import { ProblemExceptionFilter } from '@aether-zone/organon';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
```

```ts
throw new ProblemException({
  status: HttpStatus.CONFLICT,
  type: 'https://example.com/probs/slug-taken',
  title: 'That slug is already in use',
  detail: `"${slug}" belongs to another organization.`,
  extensions: { slug },
});
```

```json
{
  "type": "https://example.com/probs/slug-taken",
  "title": "That slug is already in use",
  "status": 409,
  "detail": "\"acme\" belongs to another organization.",
  "instance": "/organizations/acme",
  "slug": "acme"
}
```

Four behaviours are deliberate:

- **An unexpected error never reaches the client.** Anything that is not an
  `HttpException` becomes a bare 500 whose message is dropped — those messages
  name queries, paths and drivers. The stack is logged instead, so dropping it
  does not mean losing it.
- **`ValidationPipe`'s messages become an `errors` extension**, not a joined
  sentence, because a client marking up form fields needs them apart.
- **A blank `type` gets the status reason phrase as its `title`**, which is what
  RFC 9457 §4.2.1 asks for.
- **An extension may not shadow a standard member.** `extensions: { status }`
  throws rather than silently producing a document whose `status` disagrees
  with the response code.

## One import

`OrganonModule.forRoot()` wires configuration, logging, health and the problem
filter together.

```ts
@Module({
  imports: [
    OrganonModule.forRoot({
      config: { schema: envSchema },
      logging: { base: { service: 'akouo' } },
      health: { indicators: [DatabaseHealth] },
    }),
  ],
})
export class AppModule {}
```

Each part is registrable on its own, and this changes none of their behaviour.
It exists because two pairs of them only work properly when they know about
each other:

- **The problem filter reports the request id the logger issued.** A 500
  deliberately tells the client nothing, so that id is the only route from a
  reported failure to the stack trace explaining it.
- **The health probes are excluded from the request log**, derived from the
  health path so it stays right when the path is moved. An orchestrator polls
  them every few seconds; left in, they are most of the log.

`config` is omitted by default — there is no schema a library could supply.
`health`, `logging` and `problem` are on; pass `false` to any of them to leave
that part out.

```ts
OrganonModule.forRoot({ problem: false });   // keep your own error rendering
OrganonModule.forRoot({ health: false });    // no probes; nothing is excluded
                                             // from the log either
```

## Configuration

`AppConfigModule` loads the environment and validates it against a schema **the
application supplies**.

```ts
import { AppConfigModule, ENV, baseEnvSchema, booleanFromString } from '@aether-zone/organon';

export const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  DEBUG_MODE: booleanFromString.default(false),
});
export type Env = z.infer<typeof envSchema>;

@Module({ imports: [AppConfigModule.forRoot({ schema: envSchema })] })
export class AppModule {}
```

The schema is a parameter, not something this module owns. A library cannot
know what an application's environment looks like, and a schema fixed here
would name variables that mean nothing to most consumers — worse, *require*
them, which is a boot failure for everyone who does not happen to set them.
`baseEnvSchema` is deliberately small — `NODE_ENV`, `PORT` and `LOG_LEVEL`,
the three every service has; extend it with your own.

`LOG_LEVEL` is validated against the levels the logger knows, so a typo fails
the boot rather than being ignored. It is **optional rather than defaulted**:
`JsonLogger` already falls back to `log` under `NODE_ENV=production` and
`debug` elsewhere, and a default here would either restate that rule or quietly
override it — silencing debug output in development because a variable was
unset. Pass it straight through:

```ts
const app = await NestFactory.create(AppModule, {
  logger: new JsonLogger({ level: env.LOG_LEVEL, base: { service: 'akouo' } }),
});
```

Case and surrounding space are forgiven (`LOG_LEVEL=DEBUG` works), but the
names are Nest's, so the middle one is `log` — `info` is refused, with the
valid options named.

Inject the whole validated environment rather than fishing keys out of
`ConfigService`:

```ts
constructor(@Inject(ENV) private readonly env: Env) {}
```

`ENV` is the parsed object, so defaults and coercions are already applied —
`env.PORT` is a number, and `DEBUG_MODE=false` is `false` rather than a truthy
string. `EnvService<Env>` still narrows `ConfigService` where you want it, but
note it is a type alias and so not a DI token: name `ConfigService` in the
`@Inject` as well.

An invalid environment fails the boot, listing every problem:

```
Invalid environment configuration:
  - NODE_ENV: Invalid option: expected one of "development"|"test"|"production"
  - PORT: Invalid input: expected number, received NaN
```

`NestFactory` defaults to `abortOnError: true`, which logs that and exits; with
`{ logger: false }` there is nothing left to print it and you get a silent exit
1. Pass `abortOnError: false` to handle the rejection yourself.

`@nestjs/config` is a required peer dependency.

## Health

```ts
@Module({ imports: [HealthModule.forRoot()] })
export class AppModule {}
```

| Route | Question | Checks dependencies |
| --- | --- | --- |
| `GET /health/live` | Is the process running? | no |
| `GET /health/ready` | Can it serve traffic? | yes |
| `GET /health` | — | yes, same as `/ready` |

The path is configurable, and **replaces** the default rather than adding to it:

```ts
HealthModule.forRoot({ path: 'internal/health' });
// -> /internal/health, /internal/health/live, /internal/health/ready
```

`@Controller()` is evaluated when a class is defined, so the decorator is
applied to a fresh subclass of `HealthControllerBase` per registration —
`createHealthController(path)`, exported if you want to mount it yourself. To
keep `health` *under* a wider prefix instead, leave `path` alone and use Nest's
`RouterModule.register([{ path: 'internal', module: HealthModule }])`.

**Liveness deliberately checks nothing.** A liveness probe answers "should this
process be restarted", and restarting a healthy process because its database
went down turns one outage into two — the restarts remove capacity exactly when
the dependency recovers and the load arrives. Dependencies belong in readiness,
which takes the instance out of the load balancer and puts it back afterwards.

Register indicators for readiness:

```ts
@Injectable()
class DatabaseHealth implements HealthIndicator {
  readonly name = 'database';
  constructor(private readonly db: DataSource) {}

  async check(): Promise<HealthCheckResult> {
    await this.db.query('select 1');
    return { status: 'up' };
  }
}

HealthModule.forRoot({
  imports: [DatabaseModule],
  indicators: [DatabaseHealth],
  info: { service: 'akouo', version: process.env.APP_VERSION },
});
```

Readiness answers 200 or 503 with the same body either way:

```json
{ "status": "down", "uptime": 41,
  "info": { "service": "akouo", "version": "1.2.3" },
  "checks": { "database": { "status": "up" },
              "cache": { "status": "down", "error": "connection refused" } } }
```

Four things are deliberate:

- **Every indicator is bounded by a timeout** (3s by default). A check that
  hangs would hang the endpoint, and an endpoint that never answers reads as a
  *liveness* failure — so the process gets restarted for a fault in something
  it merely talks to.
- **An indicator that throws is reported, not propagated.** One broken check
  marks itself down and leaves the rest of the report intact.
- **The report is returned, not thrown**, so success and failure have the same
  shape. It does not go through `ProblemExceptionFilter`: a 503 from readiness
  is an expected operational signal rather than an error, and the report's own
  `status` field would collide with the problem document's.
- **The routes are `@Public()`**, so a global token guard does not apply — an
  orchestrator has no credentials, and a health endpoint behind authentication
  reports every instance as unhealthy.

Check details name the failing dependency, so keep these routes off the public
internet. Pair with the logger so the probes do not fill the log:
`LoggerModule.forRoot({ ignorePaths: ['/health', '/health/live', '/health/ready'] })`.

## Logging

`LoggerModule` gives every request an id, logs a line per request, and makes
that id available to anything the request goes on to do.

```ts
import { JsonLogger, LoggerModule } from '@aether-zone/organon';

@Module({
  imports: [
    LoggerModule.forRoot({
      base: { service: 'akouo' },
      ignorePaths: ['/health'],
    }),
  ],
})
export class AppModule {}

// The application logger has to be set before the app exists, so no module
// can do it. Give it the same options.
const app = await NestFactory.create(AppModule, {
  logger: new JsonLogger({ base: { service: 'akouo' } }),
});
```

```
{"service":"akouo","level":"log","time":"...","message":"deep inside a service",
 "context":"DeepService","requestId":"c1653b88-…"}
{"service":"akouo","level":"log","time":"...","message":"GET /ok 200 0.6ms",
 "context":"Request","requestId":"c1653b88-…"}
```

The id is carried in an `AsyncLocalStorage`, so a log written inside a service
that knows nothing about it is still attributed to the request that caused it —
without threading an argument through every function that might one day log.

**It pairs with `ProblemExceptionFilter`.** A failure's problem document carries
the same `requestId`, and it is returned in the `x-request-id` response header:

```json
{ "type": "about:blank", "title": "Internal Server Error", "status": 500,
  "instance": "/boom", "requestId": "54098bd3-…" }
```

An unexpected error deliberately tells the client nothing about what went
wrong, so that id is the only way to get from "it failed" to the stack trace
that says why. Searching the logs for it finds both the request line and the
filter's record of the exception.

Four things are deliberate:

- **Middleware, not an interceptor**, so the context is open before guards run.
  An interceptor would leave a rejected authentication outside it.
- **No request body, query string or headers are logged.** Bodies carry
  passwords and `Authorization` carries the credential itself; the request line
  logs the path with the query string stripped.
- **The level follows the status** — 5xx error, 4xx warn, otherwise log. A log
  where everything is one level cannot be filtered.
- **An inbound `x-request-id` is ignored by default.** Behind a gateway that
  sets it, turn on `trustInboundRequestId` to make one id span services; exposed
  to the internet, leave it off — an id a caller picks is one they can repeat,
  colliding their requests with someone else's in your logs. When trusted it is
  still length-capped and character-checked before being written anywhere.

Ships ESM and CommonJS: a Nest application generated today is still CommonJS, so
an ESM-only build would be unusable by the most likely consumer. `@nestjs/common`,
`@nestjs/core`, `reflect-metadata` and `rxjs` are **peer** dependencies — the
library must run against the application's Nest, not a second copy of it.
