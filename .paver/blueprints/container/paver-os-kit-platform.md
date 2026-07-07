# paver-os-kit-platform

> **Paver Level:** OS  <!-- shared foundation consumed by both roots; belongs to neither -->
> **Traces up to:** @REQ-KIT-001 (REQ-KIT-001 through REQ-KIT-007)
> **Status:** Active
> **Bootstrap mode:** Tony-approved 2026-07-06. No parent Product Overview yet; this Blueprint and @REQ-KIT-001 are the founding artifacts of the `paver-os/kit` product.
> **Last reviewed by Boris:** 2026-07-06

## Container Summary

`paver-os/kit` is a build-and-release container: a pnpm workspace of small `@paver/*` packages, orchestrated by Turborepo, that produces versioned git tags rather than a running service. It is consumed at build time by product repos in both the `paver` and `unicorn-ceo` roots. Nothing here serves traffic; the container's only output is installable package source addressed by git tag.

## Infrastructure

Node 22 is the baseline runtime, declared via `engines.node` and `.nvmrc` at the workspace root (satisfies AC-KIT-001.5). Package management is pnpm workspaces (`pnpm-workspace.yaml` globbing `packages/*`); build orchestration and caching are Turborepo (`turbo.json` with `build`, `test`, `typecheck` pipelines). Each package compiles TypeScript to ESM with emitted `.d.ts` declarations (`tsup` or `tsc` per package), so a consumer resolves both runtime and types from the git tag (satisfies AC-KIT-002.4). There is no hosting, no registry, and no observability surface — the container is inert between releases.

The workspace root owns shared config the packages extend: `tsconfig.base.json`, an ESLint flat config, and the Turborepo pipeline. A package's own `tsconfig.json` extends the base and adds only its `outDir` and `include`. This keeps the "shared TS/eslint base config" duplication (identified fleet-wide in the July 2026 review) owned in one place.

## Entry Points and Boundaries

The container exposes packages, not endpoints. Each package under `packages/<name>` is an entry point addressed as `github:paver-os/kit#<name>-v<semver>` (satisfies AC-KIT-002.1, AC-KIT-002.2). A consumer's package manager clones the tag and installs the package's built output; the boundary crossing carries package source and type declarations, nothing else.

The container consumes only its own toolchain (Node 22, pnpm, Turborepo) and the upstream SDKs each package wraps (for example `@supabase/supabase-js` and `@supabase/ssr` inside `#SupabasePackage`). It does not consume anything from the product repos that depend on it; the dependency direction is one-way, consumer → kit, which is what preserves independent-repo-per-product deploy (satisfies REQ-KIT-006).

The release boundary is a git tag. `#ReleaseTagger` is the only writer of the `<name>-v<semver>` tag namespace; a consumer is the only reader. No consumer install requires a registry credential, because the tag is a git ref reachable with the same repo access the consumer already has (satisfies AC-KIT-002.3).

## Core Components

```component
#KitWorkspace
Root pnpm + Turborepo workspace. Owns tsconfig.base.json, the ESLint flat
config, the Turborepo pipeline (build/test/typecheck), and the Node 22
engines pin. Runs `pnpm -r build`, `pnpm -r test`, `tsc --noEmit`.
```

```component
#SupabasePackage
@paver/supabase. Exports three client factories — browser, server (SSR),
and service-role admin — plus the SSR session-refresh middleware helper and
a type-generation entry. Wraps @supabase/supabase-js and @supabase/ssr.
```

```component
#EnvNewlineGuard
Utility inside @paver/supabase. Strips a literal trailing `\n` from any
Supabase env value before use. Unit-tested against a value ending in `\n`.
```

```component
#ContractsPackage
@paver/contracts. Exports a Zod schema and inferred type for Brand, SKU,
Order, Lead, and PO. Depends on no other @paver package.
```

```component
#KitCI
GitHub Actions workflow. On push, runs `pnpm -r build`, `pnpm -r test`, and
`tsc --noEmit` across the workspace and reports a commit status.
```

```component
#ReleaseTagger
The per-package release step. Bumps a package version and pushes the
`<name>-v<semver>` git tag that consumers pin to. Sole writer of the tag
namespace.
```

`#KitWorkspace` owns `#SupabasePackage` and `#ContractsPackage` as workspace members; it builds and type-checks them through the Turborepo pipeline so that `#KitCI` can gate every package from one command. This composition is what lets AC-KIT-001.1–001.3 be a single green/red signal rather than per-package drift.

`#SupabasePackage` calls `#EnvNewlineGuard` inside each of its three client factories before reading a Supabase URL or key, because the `vercel env pull` trailing-newline defect (documented fleet-wide) otherwise corrupts the client at construction. Centralizing the guard here retires the hand-rolled copy in every consumer (satisfies AC-KIT-003.2).

`#KitCI` runs `#KitWorkspace`'s three commands on every push and must pass before `#ReleaseTagger` cuts a tag, so a broken package cannot reach a consumer (satisfies AC-KIT-001.4 and enforces the REQ-KIT-001 intent). `#ReleaseTagger` depends on a green `#KitCI` run for the commit it tags.

`#ContractsPackage` is deliberately a leaf: it imports no other `@paver/*` package, so any consumer — Cargo, RACK, or a `unicorn-ceo` app — can adopt the shared data shapes without pulling in a client it does not want (satisfies AC-KIT-005.4). This is the vocabulary layer that makes a later product-to-product connection a typed import.

## System Contracts

### Key Contracts

- A released tag is immutable: once `#ReleaseTagger` pushes `<name>-v<semver>`, that ref is never moved. A change ships as a new tag, so a consumer's pinned dependency is reproducible (upholds REQ-KIT-002).
- A kit release alters no consumer that has not changed its pinned tag; adoption is pull-based only (upholds AC-KIT-006.1).
- `#EnvNewlineGuard` is idempotent: applying it to an already-clean value returns that value unchanged (upholds AC-KIT-003.2, testable per AC-KIT-003.5).
- `#ContractsPackage` has no `@paver/*` dependency edge; violating this fails the leaf invariant (upholds AC-KIT-005.4).

### Integration Contracts

- Release artifact: git tag `<package>-v<semver>` (for example `supabase-v0.1.0`, `contracts-v0.1.0`) carrying the built ESM output and `.d.ts` declarations for that package.
- Consumer dependency declaration: `"@paver/<name>": "github:paver-os/kit#<package>-v<semver>"` (satisfies AC-KIT-002.2).
- `#SupabasePackage` public surface: named exports `createBrowserClient`, `createServerClient`, `createAdminClient`, an SSR middleware helper, and a documented type-gen entry (satisfies AC-KIT-003.1, AC-KIT-003.3, AC-KIT-003.4).
- `#KitCI` status: a pass/fail commit check gating `#ReleaseTagger` (satisfies AC-KIT-001.4).

### Integration Boundaries

- Kit owns shared infrastructure code (clients, guards, contracts, base config). A consumer owns its own application code and its own deploy pipeline. The line is the git-tag install boundary: kit ships source, the consumer ships the product. Kit introduces no shared build step or deploy linkage across that line (upholds AC-KIT-006.2).
- Kit is root-agnostic. It is consumed identically from `paver/projects/*` and from `unicorn-ceo/{apps,projects}/*`; no root-specific configuration exists in kit (upholds AC-KIT-006.3). This is what keeps the deliberate two-root split intact — the shared code lives in neither root.
- The Cargo and RACK adoptions (@REQ-KIT-004) are the only edges that reach from a consumer into kit's proof surface. Each deletes its local `lib/supabase/*` and re-points imports at `#SupabasePackage`, then proves its own `tsc --noEmit` + `npm run build` stays green independently (satisfies AC-KIT-004.1–004.6).

## Architecture Decision Records

### ADR-001: Git-tag distribution instead of a package registry

**Context:** Consumers span two roots and many independent repos, each deploying on its own pipeline (Vercel, Cloudflare, local). A shared package layer must reach all of them without adding per-repo auth or a new hosted dependency. The options were git-tag pinning, a private GitHub Packages registry, or public npm.

**Decision:** Consumers depend on kit by pinned git tag — `github:paver-os/kit#<package>-v<semver>`. Because npm/pnpm cannot install a subdirectory of a git repo as a package, `#ReleaseTagger` cuts each tag via `git subtree split --prefix=packages/<name>`, producing a tree whose root **is** the package; the tag points at that split tree. The consumer's install then runs the package's `prepare` script to build `dist`. `#ReleaseTagger` (`scripts/release.sh`) is the sole writer of the tag namespace; tags are immutable. No registry is provisioned and no consumer CI carries an `NPM_TOKEN`. Operator-decided 2026-07-06 (distribution) and 2026-07-06 (subtree-split mechanism).

**Consequences:** Zero registry setup and zero CI-auth friction; a consumer installs a kit package with the repo access it already has (satisfies AC-KIT-002.3). The subtree-split tree carries package source, so the consumer builds it at install time via `prepare` (git installs the package's devDeps to do so) — one reason each package keeps a self-contained `build` script. The costs: no semver-range resolution (an upgrade is an explicit tag change per consumer); the tag namespace grows one prefix per package; and a release is a scripted split rather than a plain `git tag`. If range-based upgrades later become worth the auth cost, REQ-KIT-002 and this ADR are revised in place and the change is logged in the drift log.

### ADR-002: Published packages, not a monorepo folder inside a root

**Context:** The fleet deliberately runs two command-center roots — `paver` (product engineering) and `unicorn-ceo` (Madson operations). Shared code could live as a workspace folder inside one root, or as a standalone published unit.

**Decision:** Kit is its own repository, consumed as an external dependency by both roots. Shared code lives in neither root.

**Consequences:** Neither root gains gravity over the other, and the two-root split stays clean — the seam rule (reusable-across-both code lives in kit, never back inside a root) is structurally enforced by the repo boundary. The cost is that kit cannot use in-repo workspace linking to a consumer; every consumer relationship is an arms-length git-tag install, which is exactly what ADR-001 already requires. A monorepo folder was rejected because it would force one root to own the shared layer and reintroduce the drift the two-root split was chosen to avoid.

### ADR-003: Turborepo + pnpm workspace with a shared config root

**Context:** Kit holds multiple packages that share a TypeScript and lint baseline and must build and test as one gated unit for `#KitCI`. The build tool and the ownership of shared config were open.

**Decision:** pnpm workspaces for package management, Turborepo for build/test/typecheck orchestration and caching. `#KitWorkspace` root owns `tsconfig.base.json`, the ESLint flat config, and the Turborepo pipeline; each package extends the base.

**Consequences:** One command (`pnpm -r build` / `pnpm -r test` / `tsc --noEmit`) verifies the whole workspace, so `#KitCI` is a single signal (satisfies REQ-KIT-001). Shared config is owned once, retiring the copy-pasted tsconfig/eslint identified fleet-wide. The cost is a pnpm + Turborepo toolchain requirement inside kit only — it does not propagate to consumers, which receive plain built packages (upholds AC-KIT-006.2).

### ADR-004: Cargo and RACK as the proof-of-concept adopters

**Context:** `@paver/supabase` must be proven against real apps before the fleet is told to adopt it. The review found Cargo and RACK to be the two cleanest modern apps (Next 16 / React 19), both already on the Supabase SSR pattern the package generalizes.

**Decision:** Cargo and RACK are the required first consumers (@REQ-KIT-004). Each replaces its local `lib/supabase/*` with `#SupabasePackage`, deletes the old files, and must keep its own `tsc --noEmit` + `npm run build` green.

**Consequences:** Two independent green migrations prove the package's SSR/server/admin surface and the git-tag install against production apps before wider rollout. Deleting the local copies (not leaving them dormant) is what makes the deduplication real and forces the package's exports to actually cover the apps' needs. The cost is that a gap in `#SupabasePackage`'s surface blocks a live app until fixed — an intentional forcing function, not a risk to hide behind a fallback copy.

### ADR-005: `@paver/contracts` ships as a dependency-free leaf

**Context:** The contracts package exists to let products share the shapes that cross their boundaries (Brand, SKU, Order, Lead, PO). It could bundle validation helpers from other kit packages, or stand alone.

**Decision:** `#ContractsPackage` depends on no other `@paver/*` package. It exports only Zod schemas and their inferred types (satisfies AC-KIT-005.1, AC-KIT-005.4).

**Consequences:** Any consumer can adopt the shared vocabulary in isolation, without pulling a Supabase or Shopify client it does not use — the lowest-friction path to a common data language, which is the prerequisite for the Phase-2 product connections. The cost is that cross-contract validation logic, if ever needed, must live in a separate consumer or a future package rather than inside contracts; keeping the leaf pure is worth more than that convenience.
```
<!--
Boris's notes:
- Six-Principle Stamp: Code-grounded (paths + AC cites), Composition-first (#components as nodes,
  paragraphs as edges), Structured-and-narrative, Implementable, Markdown-native, Living-artifact.
- Deferred packages (@paver/auth-gate, @paver/ui, @paver/shopify, @paver/google, @paver/qb) are NOT
  given components here — per @REQ-KIT-007 each gets its own Requirement + Blueprint section when its
  first consumer commits. Introducing them now would be speculative structure (rule 8).
- Next Work Order should scaffold #KitWorkspace + #SupabasePackage + #EnvNewlineGuard + #KitCI first
  (satisfies REQ-KIT-001..003), then the Cargo/RACK migration (REQ-KIT-004), then #ContractsPackage.
-->
