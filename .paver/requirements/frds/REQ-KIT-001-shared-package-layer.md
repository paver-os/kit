# Shared Package Layer (paver-os/kit)

> **Type:** Feature Requirements Document (FRD)
> **ID Prefix:** KIT
> **Status:** Active
> **Owner:** Tony Davis (operator) · Karl Strunk (Author)
> **Bootstrap mode:** APPROVED by Tony 2026-07-06. No upstream Product Overview exists yet; this FRD is the first artifact of the `paver-os/kit` product. Re-grade when a Product Overview is authored.
> **Implemented in:** <!-- populated as the container blueprint + Work Orders ship -->

## Overview

The Madson/Paver fleet reinvents the same infrastructure in every repo. A July 2026 fleet review across ~26 projects counted 15–20 hand-rolled copies of the same clients: the Supabase SSR client set rebuilt in five apps, an allowlist auth gate copied across four, a shadcn/utils UI scaffold copied across four, and 6–7 Shopify / 4+ Google / 3 QuickBooks client implementations. Each copy drifts independently, carries the same bugs (the `vercel env pull` trailing-newline hack is hand-rolled per repo), and blocks any two products from sharing a data shape.

`paver-os/kit` is one Turborepo + pnpm monorepo that publishes small, versioned packages the whole fleet consumes. It is the shared foundation that must exist *before* products are wired together: shared clients kill the duplication, and a shared contracts package gives products a common vocabulary so a later connection is a typed import, not a coupling.

The fleet runs two command-center roots by deliberate decision — `paver` (product engineering) and `unicorn-ceo` (Madson operations). Kit belongs to neither. It is consumed by both as an external dependency, which is why it ships as published packages rather than a monorepo folder inside one root. Products keep their own repos and their own independent deploys; kit changes nothing about how a product ships.

After this FRD ships: Cargo and RACK each import `@paver/supabase` and have deleted their local copy; `@paver/contracts` exists at v0 with the fleet's core data shapes; and the next repo that needs a Supabase client adds one line instead of copying a folder.

## Terminology

- **Kit** — the `paver-os/kit` repository: a pnpm workspace of `@paver/*` packages built with Turborepo.
- **Package** — one publishable unit under `packages/`, scoped `@paver/<name>`, versioned and tagged independently.
- **Consumer** — any repo in the paver or unicorn-ceo roots that depends on a kit package.
- **Git-tag distribution** — a consumer declares a kit dependency as `github:paver-os/kit#<package>-v<semver>` and pins to that tag; upgrading means changing the tag. No package registry, no CI auth token.
- **Env-newline guard** — the routine that strips the literal trailing `\n` that `vercel env pull` appends to secret values (documented fleet-wide; today hand-rolled per repo).
- **Contract** — a shared data shape (a Zod schema plus its inferred TypeScript type) describing an entity that crosses product boundaries: Brand, SKU, Order, Lead, PO.
- **Opt-in adoption** — a consumer adopts a kit package only when it chooses to; no product is forced to migrate on a kit release.

## Requirements

### REQ-KIT-001: Kit builds and verifies as one workspace

**User Story:** As the fleet maintainer, I want kit to build, type-check, and test every package from one command on CI, so that a broken package cannot be tagged for consumers.

**Acceptance Criteria:**

- **AC-KIT-001.1:** When `pnpm -r build` runs at the kit root, the workspace shall build every package under `packages/` with exit code 0.
- **AC-KIT-001.2:** When `pnpm -r test` runs at the kit root, the workspace shall run each package's test suite and exit non-zero if any test fails.
- **AC-KIT-001.3:** When `tsc --noEmit` runs at the kit root, the type-check shall pass across every package with no errors.
- **AC-KIT-001.4:** When a commit is pushed to the kit repository, a GitHub Actions workflow shall run AC-KIT-001.1 through AC-KIT-001.3 and report a pass/fail status on the commit.
- **AC-KIT-001.5:** The kit workspace shall declare Node 22 as its runtime via an `engines` field and an `.nvmrc` file.

### REQ-KIT-002: Consumers depend on kit by pinned git tag

**User Story:** As a consumer-repo maintainer, I want to add a kit package as a git-tag dependency, so that I get a shared client without configuring a package registry or a CI auth token.

**Acceptance Criteria:**

- **AC-KIT-002.1:** Each package shall be releasable under a git tag of the form `<package>-v<semver>` (for example `supabase-v0.1.0`).
- **AC-KIT-002.2:** When a consumer declares `"@paver/<name>": "github:paver-os/kit#<package>-v<semver>"` and runs its package manager's install, the consumer shall resolve and install that package with exit code 0.
- **AC-KIT-002.3:** A consumer's install and CI shall require no npm registry authentication token to resolve a kit dependency.
- **AC-KIT-002.4:** Each package shall ship a build output consumable by both a Next.js App Router app and a Node script (ESM, with type declarations).

### REQ-KIT-003: `@paver/supabase` replaces the hand-rolled client set

**User Story:** As a product engineer, I want one Supabase package that provides the browser, server, and admin clients plus the env-newline guard, so that I stop copying `lib/supabase/*` into every app.

**Acceptance Criteria:**

- **AC-KIT-003.1:** `@paver/supabase` shall export a browser-client factory, a server-client factory, and a service-role admin-client factory as three named exports.
- **AC-KIT-003.2:** When any factory reads a Supabase environment value, the package shall apply the env-newline guard to that value before use.
- **AC-KIT-003.3:** `@paver/supabase` shall export a helper that constructs the Next.js SSR session-refresh middleware behavior a consumer's `middleware.ts` requires.
- **AC-KIT-003.4:** `@paver/supabase` shall export a type-generation entry point or documented command that produces typed database definitions from a Supabase project schema.
- **AC-KIT-003.5:** The env-newline guard shall have a unit test asserting that a value ending in a literal `\n` is returned without the trailing newline.

### REQ-KIT-004: Cargo and RACK prove adoption end to end

**User Story:** As the fleet maintainer, I want two live products consuming `@paver/supabase` with their local copies deleted, so that the shared package is proven against real apps before the fleet adopts it.

**Acceptance Criteria:**

- **AC-KIT-004.1:** Cargo shall declare `@paver/supabase` as a pinned git-tag dependency and construct its Supabase clients through that package.
- **AC-KIT-004.2:** Cargo's previous local Supabase client files shall be deleted, and no source file in Cargo shall import from the deleted paths.
- **AC-KIT-004.3:** After adoption, Cargo shall pass `tsc --noEmit` and `npm run build` with exit code 0.
- **AC-KIT-004.4:** RACK shall declare `@paver/supabase` as a pinned git-tag dependency and construct its Supabase clients through that package.
- **AC-KIT-004.5:** RACK's previous local Supabase client files shall be deleted, and no source file in RACK shall import from the deleted paths.
- **AC-KIT-004.6:** After adoption, RACK shall pass `tsc --noEmit` and `npm run build` with exit code 0.

### REQ-KIT-005: `@paver/contracts` v0 defines the cross-product shapes

**User Story:** As a fleet architect, I want the entities that cross product boundaries defined once as shared schemas, so that a later product-to-product connection is a typed import rather than a re-modeled coupling.

**Acceptance Criteria:**

- **AC-KIT-005.1:** `@paver/contracts` shall export a Zod schema and its inferred TypeScript type for each of: Brand, SKU, Order, Lead, and PO.
- **AC-KIT-005.2:** Each contract schema shall have a test that parses a valid example and rejects an invalid example.
- **AC-KIT-005.3:** `@paver/contracts` shall be released under a `contracts-v0.x` git tag consumable per REQ-KIT-002.
- **AC-KIT-005.4:** `@paver/contracts` shall depend on no other `@paver/*` package, so that any consumer can adopt it in isolation.

### REQ-KIT-006: Adoption is opt-in and deploy-neutral

**User Story:** As a product owner, I want kit to change nothing about how my product deploys and to never force an upgrade, so that the shared layer reduces risk instead of adding it.

**Acceptance Criteria:**

- **AC-KIT-006.1:** A consumer shall depend on a kit package only by adding it explicitly; a kit release shall not alter any consumer that has not changed its pinned tag.
- **AC-KIT-006.2:** Kit shall introduce no shared build step, workspace linkage, or deploy dependency into any consumer's existing deploy pipeline.
- **AC-KIT-006.3:** Kit shall be consumable from both the `paver` root and the `unicorn-ceo` root with no root-specific configuration.

### REQ-KIT-007: Remaining shared packages are named, not yet specified

**User Story:** As the Author, I want the fleet's remaining duplication targets recorded as named future Requirements, so that each ships its own testable ACs when its first consumer aligns rather than being built speculatively now.

**Acceptance Criteria:**

- **AC-KIT-007.1:** The following packages shall each receive their own Requirement, authored when a first consumer commits to adopting them, before any implementation Work Order opens: `@paver/auth-gate`, `@paver/ui`, `@paver/shopify`, `@paver/google`, `@paver/qb`.
- **AC-KIT-007.2:** No package named in AC-KIT-007.1 shall ship an implementation Work Order until its Requirement passes the Six-Quality Stamp.

<!--
Karl's notes:
- Bootstrap mode is declared and operator-approved; REQ-KIT-007 keeps the deferred packages traceable so they are not orphans and not speculative ACs.
- REQ-KIT-004 is the only Requirement that reaches outside the kit repo (into Cargo + RACK); its ACs are the proof-of-concept gate for the whole FRD.
- Distribution mechanism (git-tag pinning, REQ-KIT-002) was operator-decided 2026-07-06; if the fleet later moves to a registry, REQ-KIT-002 is revised in place and this line noted in the drift log.
-->
