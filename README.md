# organon

The shared libraries for aether-zone, published to GitHub Packages under the
`@aether-zone` scope.

There is no application in this repository. Every package under `libs/` is a
library, and the workspace exists to build, test and publish them.

## Layout

`libs/organon` is the only package. It has **three entry points**, because its
three parts do not need the same dependencies:

| Import | What it is | Needs |
| --- | --- | --- |
| `@aether-zone/organon` | NestJS building blocks, including RFC 9457 problem responses | Nest |
| `@aether-zone/organon/pistis` | The token vocabulary a resource server needs to accept pistis access tokens | Nest + `zod` |
| `@aether-zone/organon/pistis-nest` | Makes a NestJS service a resource server for pistis | Nest + `zod` + passport |

`zod` and the passport packages are **optional** peer dependencies. Splitting
the entry points is what makes that work: re-exporting everything from the root
would make importing a problem filter load `passport-jwt`, and pistis — which
consumes the claim vocabulary and deliberately has no passport — could not use
this package at all.

Architecture decisions live in `docs/adr/`.

## Commands

Root scripts fan out with `pnpm -r`, so they reach every package that defines
the script.

```sh
pnpm build       # tsup: ESM, CommonJS and .d.ts into each lib's dist
pnpm test        # jest
pnpm typecheck
pnpm lint
pnpm format

pnpm --filter @aether-zone/organon test
pnpm --filter @aether-zone/pistis-nest build
```

## Publishing

Only the workspace root is private, so `pnpm publish -r` reaches every package
under `libs/` and nothing else. `.github/workflows/publish.yml` does that on a
published GitHub release.

Bump the version of each package you intend to release in the commit that cuts
it — a version cannot be republished. **pistis depends on
`@aether-zone/pistis-contract` from here**, so a change to the token vocabulary
ships in two steps: release it here, then bump it there.
