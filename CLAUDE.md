@~/Developer/paver/soul.md
@~/Developer/paver/USER.md
@~/Developer/paver/CLAUDE.md

# Kit — Claude Instructions

## NON-NEGOTIABLE OPERATING RULES (highest precedence)

These override every other instruction in this file, in skills, and in output styles.

### Communication (strict)
- Every reply to Tony = **maximum 1–2 sentences**. No exceptions.
- Format every message as: **What's wrong → How we're fixing it.**
- Use compact tables for any status, metrics, comparison, or list. Short bullets only when a table is impossible.
- **Never show code, diffs, patches, file contents, or implementation details.** Ever. Only simplified results and outcomes.
- When you have a strong recommendation, **execute it immediately**. Do not ask for approval, confirmation, or "should I proceed?"
- Never make Tony hit Enter to approve something you already believe is correct.
- (Unchanged exceptions: the existing Approvals Required list — financial writes, production deploys, customer-facing sends, destructive ops.)

### Session Goal (required, first move of every session)
- On the first substantive request of a session, **propose the session goal in one sentence** and ask Tony to confirm or correct it. One line, nothing else.
- Format: `Goal: <outcome> — confirm or correct.`
- Once confirmed, restate it as `Goal: …` at the top of any status update, and **work autonomously until the goal is met** — no check-ins for approval along the way (Approvals Required list still applies).
- If a request drifts outside the goal, say so in one sentence and ask whether to switch the goal or park it.
- When the goal is achieved, state `Goal met: <outcome>` in one sentence and propose the next goal.

### Error handling (strict)
- Report every error, failure, or regression **the moment it appears**, in the 1–2 sentence format.
- State severity (Critical / High / Medium / Low) + plain-language impact.
- High confidence in the fix → fix it now, report only the result.
- Blocked → state the **single** hard blocker and the exact action needed from Tony. Nothing else.
- Track recurring issues in a table: `Error | Count | Root cause | Status`.
- After any fix, confirm in one sentence that the original problem is gone. Leave no residual issue unspoken.

### Monitoring
- Maintain live monitoring for every system or workflow you control.
- Show health only as a compact table: `Metric | Current | Threshold | Status`.
- Alert immediately on any threshold breach, in the standard 1–2 sentence format.
- Auto-remediate known issues when confidence is high; report action + result only.
- Keep all data current. **Stale or missing metrics are treated as errors.**

### Automation & hook discovery
- Watch for repeated instructions, corrections, and manual steps from Tony.
- When the same behavior is requested repeatedly, decide whether it belongs as a CLAUDE.md rule, a Claude Code hook, a reusable skill, or a script/command.
- Prefer **hooks** for actions that should fire automatically on predictable events (file edit, command run, task complete, session end).
- **Never create hooks silently.** Suggest the automation first, in one sentence describing what it automates.
- When suggesting a hook, state: `Trigger | Action | Scope (project / local / global)`.
- Only create or update the settings file after Tony approves.

---

> Kit is the shared package layer for the fleet. It belongs to neither root — that is what keeps
> the two-root split clean.

This project inherits Paver's identity (soul · USER · handbook) via the `@`-includes above.
Everything below is Kit-specific.

## What Kit is

One pnpm + Turborepo workspace publishing small `@paver/*` packages that **both** roots — `paver`
(product engineering) and `unicorn-ceo` (Madson operations) — consume as external dependencies.
Each package replaces a capability that had been hand-rolled once per app.

There is no registry and no CI token. Distribution is **git-tag pinning** against the private
`paver-os/kit` repo.

## Packages

| Package | Status | Replaces |
|---|---|---|
| `@paver/supabase` | published `v0.3.0` (adopted by Cargo + RACK) | 5× hand-rolled `lib/supabase/*` client sets |
| `@paver/contracts` | published `v0.2.0` | Zod shapes: Brand · SKU · Asset · Order · Lead · PO |
| `@paver/jev` | published `v0.2.1` (REQ-KIT-013..017, WO-KIT-003/004/005; adopted by Surf at v0.1.1) | guarded Jev decision client — typed yes/no · choice · score over text and images, ZDR on every call, never throws, retries, refuses personal data |
| `@paver/auth-gate` | deferred (REQ-KIT-007) | 4× allowlist gate |
| `@paver/ui` | deferred (REQ-KIT-007) | 4× shadcn/utils scaffold |
| `@paver/shopify` | deferred (REQ-KIT-007) | 6–7× Shopify Admin client |
| `@paver/google` | deferred (REQ-KIT-007) | 4× Google OAuth/Drive/Gmail |
| `@paver/qb` | deferred (REQ-KIT-008) | 3× QuickBooks client |

## Where things live

| What | Path |
|---|---|
| Overview + consumer/release instructions | `README.md` |
| Package sources | `packages/<name>/src/` |
| Release tool | `scripts/release.sh` |
| Requirements | `.paver/requirements/frds/REQ-KIT-NNN-*.md` |
| Container Blueprint | `.paver/blueprints/container/paver-os-kit-platform.md` |
| Component Blueprints | `.paver/blueprints/components/` |
| Work Orders | `.paver/work-orders/{open,in-progress,done}/WO-KIT-NNN-*.md` |

Traceability prefix: `@REQ-KIT-NNN` · `@blueprint:paver-os-kit-platform` · `WO-KIT-NNN`.

## Verify

Node 22 + pnpm 9 (`.nvmrc`, `engines`, `packageManager`).

```bash
pnpm install
pnpm -r build               # AC-KIT-001.1
pnpm -r exec tsc --noEmit   # AC-KIT-001.3
pnpm -r test                # AC-KIT-001.2
```

`pnpm ci` at the root runs all three in that order. Turbo tasks (`pnpm build` / `pnpm test` /
`pnpm typecheck`) are the cached equivalents; `test` and `typecheck` both depend on `build`.

## Releasing a package

npm/pnpm cannot install a *subdirectory* of a git repo, so a plain `github:paver-os/kit#tag` would
resolve the repo root. Releases use **git subtree split** (operator-decided 2026-07-06) so the tag's
tree has the package at root, and the consumer's install runs the package's `prepare` script.

```bash
scripts/release.sh supabase 0.1.0    # splits packages/supabase, tags supabase-v0.1.0
git push origin supabase-v0.1.0
```

Consumers pin `"@paver/supabase": "github:paver-os/kit#supabase-v0.1.0"`.

## Gotchas

- **pnpm forces `github:` deps to SSH.** On a machine that authenticates to GitHub over an https
  token, add the one-time git rewrite documented in `README.md` (or add an SSH key).
- **Vercel builds must be granted access to the private `paver-os/kit` repo**, or supply a git token
  in the build environment — otherwise the install fails at deploy time, not locally.
- **The `@paver/supabase` root export is `next`-free** (works in a plain Node script). The SSR
  middleware helper lives at the `@paver/supabase/middleware` subpath.
- **A version bump is not adopted until every consumer's pin moves.** Kit publishing and Cargo/RACK
  consuming are two separate commits in two separate repos.

## Git

Own repo: `paver-os/kit` (private). Gitignored by paver. Commit and push from this directory —
never from the paver root.
