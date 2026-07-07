# paver-os/kit

Shared package layer for the Madson/Paver fleet. One pnpm + Turborepo workspace
publishing small `@paver/*` packages that both roots — `paver` (product
engineering) and `unicorn-ceo` (Madson operations) — consume as external
dependencies. Kit belongs to neither root; that is what keeps the two-root
split clean.

- **Requirement:** `.paver/requirements/frds/REQ-KIT-001-shared-package-layer.md`
- **Blueprint:** `.paver/blueprints/container/paver-os-kit-platform.md`
- **Runtime:** Node 22 (`.nvmrc`, `engines`)
- **Distribution:** git-tag pinning — `github:paver-os/kit#<package>-v<semver>` (no registry, no CI token)

## Packages

| Package | Status | Replaces |
|---|---|---|
| `@paver/supabase` | scaffolded (v0.1.0) | 5× hand-rolled `lib/supabase/*` client sets |
| `@paver/contracts` | planned | (new) Zod shapes: Brand · SKU · Order · Lead · PO |
| `@paver/auth-gate` | deferred (REQ-KIT-007) | 4× allowlist gate |
| `@paver/ui` | deferred (REQ-KIT-007) | 4× shadcn/utils scaffold |
| `@paver/shopify` | deferred (REQ-KIT-007) | 6–7× Shopify Admin client |
| `@paver/google` | deferred (REQ-KIT-007) | 4× Google OAuth/Drive/Gmail |
| `@paver/qb` | deferred (REQ-KIT-007) | 3× QuickBooks client |

## Verify

```bash
pnpm install
pnpm -r build        # AC-KIT-001.1
pnpm -r exec tsc --noEmit   # AC-KIT-001.3
pnpm -r test         # AC-KIT-001.2
```

Requires Node 22 + pnpm 9 (fleet is mid-migration off Node 20).

## Releasing a package

npm/pnpm cannot install a *subdirectory* of a git repo as a package, so a plain
`github:paver-os/kit#supabase-v0.1.0` tag would resolve the repo root. Releases
therefore use **git subtree split** (operator-decided 2026-07-06) so the tag's
tree has the package at root. The consumer's install runs the package's
`prepare` script to build `dist`.

```bash
scripts/release.sh supabase 0.1.0    # splits packages/supabase, tags supabase-v0.1.0
git push origin supabase-v0.1.0
```

Consumers then pin:

```json
"@paver/supabase": "github:paver-os/kit#supabase-v0.1.0"
```
