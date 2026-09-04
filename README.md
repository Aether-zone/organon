# organon

The shared libraries for aether-zone, published to GitHub Packages under the
`@aether-zone` scope.

There is no application in this repository. Every package under `libs/` is a
library, and the workspace exists to build, test and publish them.

## Layout

`libs/organon` is the only package, and it has **one entry point**:

| Import | What it is | Needs |
| --- | --- | --- |
| `@aether-zone/organon` | NestJS building blocks, RFC 9457 problem responses, and the pistis resource-server contract and guard | Nest + `zod` + passport |

Every peer dependency is therefore **required**, including the passport three.
The root barrel re-exports `auth/`, which imports them as values, so requiring
this package requires them even for a consumer that only wants a problem
filter — and pistis itself, which consumes the claim vocabulary and
deliberately has no passport, cannot use this package at all.

Splitting the token vocabulary into its own entry point is what would buy that
back. It was documented here before it existed; that claim has been removed
rather than left standing, and the split remains worth doing.

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
