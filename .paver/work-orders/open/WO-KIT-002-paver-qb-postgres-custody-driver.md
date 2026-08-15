---
owner: builder
blocks: [WO-CARGO-020, WO-026]
blocked-by: [WO-KIT-001]
open-blockers: [spec-first-refresh-grace-window, bootstrap-operator-approval-exchange-intent]
---

# WO-KIT-002: `@paver/qb/postgres` — the shared advisory-lock custody driver

> **Repo:** `paver-os/kit` · **Allocated 2026-08-14 by Andrew Taylor (Foreman).**
>
> **Revision 3 — 2026-08-14 (Foreman R7, R12).** **Bootstrap mode is retired.** Both declared holes
> are closed by `@REQ-KIT-008` Revision 4: this Work Order now claims `AC-KIT-009.30` and `.31`, and
> the consumer-runs-the-suite obligation became `AC-KIT-011.30`/`.31` on the consumers. All three
> `open-blockers` are cleared. One new in-build hard pause replaces them —
> `spec-first-refresh-grace-window`, because Karl specified the exchange-intent row's **detection**
> and deliberately declined to specify its **response**.
>

> **This Work Order is new, and it exists because Boris's ADR-010 created scope no Work Order
> owned.** Until Revision 2 of `@blueprint:paver-qb-guarded-quickbooks-client`, the Postgres custody
> driver was Cargo's — built inside Cargo's repository by `WO-CARGO-020`. `WO-026` then required
> Ledger to lock the same row "through Cargo's Postgres driver", which Ledger cannot import: separate
> repositories, and `AC-KIT-011.4` forbids a Ledger test from reading a file outside the Ledger repo.
> That dependency had no home (Karl's F3). ADR-010 moves the driver into the package. This Work Order
> is that move, given an owner, a scope and a blocker list rather than folded silently into
> `WO-KIT-001`, whose own Out of Scope table said the driver was not its.

## Summary

Both consumers lock the same `qb_token` row. The lock protocol is therefore **one artifact or it is
drift** — two implementations of one lock over one rotating credential is the failure `@REQ-KIT-009`
exists to prevent, reintroduced by repository layout rather than by carelessness.

`#PostgresAdvisoryLockTokenDriver` ships from `@paver/qb/postgres`, satisfies the
`TokenCustodyContract` `WO-KIT-001` defines, and takes an **injected `Queryable`** — a handle with
`query` and `transaction` — from whichever consumer opened the socket. It imports no database
library, so `@paver/qb`'s serverless-surface guard still holds and the connection, pool sizing and
credential handling stay with the runtime that owns them.

It ships **no** table, **no** migration, **no** connection and **no** credential. Those are the
consumers': Cargo's `WO-CARGO-020` (migration `0026`, the pooled connection, the conformance run),
Ledger's `WO-026` (a CLI connection to the same route).

Released as tag `qb-v1.1.0`. `GATE_CONTRACT_VERSION` does **not** change — no gate named in
`@REQ-KIT-008` changes behaviour, so `AC-KIT-011.14` is not triggered. Both consumers pin
`qb-v1.1.0` or later.

## In Scope

- **`#PostgresAdvisoryLockTokenDriver`** at entry point `@paver/qb/postgres`:
  - `read(tenantKey)` — a single scoped `SELECT`, no lock (`AC-KIT-009.22` keeps the common path out
    of the lock, so this is the path almost every request takes).
  - `withLock(tenantKey, mutate)` — one transaction whose **first** statement is
    `pg_advisory_xact_lock` over a key derived from `tenantKey`, followed by a fresh `SELECT`, the
    caller's mutation, the write, and commit.
  - `describe()` — names the driver, the lock mechanism and the isolation level it opens with, so a
    conformance run records what it graded rather than what it assumed.
- **Transaction-mode obligations, in the driver, not in a consumer's README** (ADR-010, ADR-020):
  prepared statements disabled; **only** transaction-scoped locks taken — a session-scoped
  `pg_advisory_lock` on a multiplexed Supavisor backend outlives its caller and is inherited by
  whoever next receives that connection, which is exactly what `AC-KIT-009.28` fails a driver for.
- **`READ COMMITTED`, opened explicitly and reported by `describe()`.** Under `REPEATABLE READ` or
  `SERIALIZABLE` the waiter's snapshot is fixed at `pg_advisory_xact_lock` — taken *before* the
  holder committed — so it reads the stale record, fails the freshness re-check, and exchanges an
  already-spent token behind a flawless lock (`WO-KIT-001` added AC 9).
- **`SET LOCAL lock_timeout` and `SET LOCAL statement_timeout`**, both caller-supplied. On timeout
  the driver **refuses**; it never proceeds without the lock.
- **The exchange-intent row** — `qb_token_exchange_intent`, written and **committed in its own
  transaction before** the lock transaction opens, and cleared after the rotated record is durably
  written. See added AC 2: `generation` and `rotated_at` alone cannot distinguish "we exchanged and
  lost the result" from "we never exchanged", because both are written inside the transaction that
  rolls back. The driver owns the statements; Cargo's migration owns the table.
- **The driver's own entry in `#ServerlessSurfaceGuard`'s walk** — `@paver/qb/postgres` becomes a
  fourth public entry point and `AC-KIT-010.4` walks it. It must import no database library, or
  `pg`'s transitive graph decides whether `AC-KIT-010.1`–`.3` hold.
- **A `Queryable` contract**, documented with the exact shape each consumer must supply, plus a
  worked example for a `pg.Pool` client and for a CLI connection.
- **A deliberately broken reference driver** used by `COV_KIT_015` — session-scoped lock, wrong
  isolation level — so the suite is proven to fail something before it is trusted to pass this.

## Out of Scope

- The `qb_token` and `qb_token_exchange_intent` **tables**, their `service_role` grants and their
  migration — Cargo's, `WO-CARGO-020`, migration `0026`.
- Opening a connection, sizing a pool, holding `SUPABASE_DB_PASSWORD` — each consumer's.
- Running the conformance suite over a production route — each consumer's build gate, and now each
  consumer's **Requirement**: `AC-KIT-011.30` (Cargo, `WO-CARGO-020`) and `AC-KIT-011.31` (Ledger,
  `WO-026`). Note what D4 makes of those two runs: one Intuit application means **one rotating
  refresh token shared by both products**, so the contention the suite grades is cross-PRODUCT —
  Cargo's serverless instances against Ledger's CLI — not merely cross-process within one deployable.
- The conformance suite itself, the `TokenCustodyContract`, the cipher and every package obligation
  in `@REQ-KIT-009` — `WO-KIT-001`.
- An OAuth redirect surface. Re-consent stays Ledger's `auth` command (ADR-020).

## Requirements

**Bootstrap mode is retired for the driver and RE-DECLARED, narrowly, for the exchange-intent row
(Foreman ITEM 2, 2026-08-14).** Both Revision 2 holes are closed by `@REQ-KIT-008` Revision 4 and the
two criteria below are claimed — but they authorize the **driver**, not added AC 2's committed intent
row, which is specified in a Blueprint and in no Requirement. See
`bootstrap-operator-approval-exchange-intent` under Blockers. Cited verbatim from
`@artifact:projects/kit/.paver/requirements/frds/REQ-KIT-008-paver-qb-guarded-quickbooks-client.md`
(**Revision 6**):

- **AC-KIT-009.30:** The package shall export a token-custody driver, satisfying the interface in AC-KIT-009.1, that stores its records in a database.
- **AC-KIT-009.31:** The driver required by AC-KIT-009.30 shall take its database handle as a caller-supplied argument, so that the package imports no database library and AC-KIT-010.1 through AC-KIT-010.3 continue to hold from that driver's entry point.

| Declared hole (Revision 2 of this WO) | Closed by |
|---|---|
| 1 — no AC requires the package to export a database-backed custody driver at all; ADR-010 was architecture without a Requirement | **`AC-KIT-009.30`, `.31`** — claimed above. This Work Order's principal deliverable is now a required capability |
| 2 — nothing obliges a *consumer* to run the conformance suite against the driver it deploys (Boris's cargo defect 4) | **`AC-KIT-011.30`** (Cargo, claimed by `WO-CARGO-020`) and **`AC-KIT-011.31`** (Ledger, claimed by `WO-026`). Split one-per-repo so exactly one Work Order claims each. Not claimed here — the run is the consumer's act, not the package's |

`AC-KIT-009.31` is the criterion that keeps this driver from breaking `@paver/qb`'s serverless
surface: it is why added AC 4 below asserts the built graph of `@paver/qb/postgres` contains no
database library. Without the injected-handle requirement, `pg`'s transitive graph would decide
whether `AC-KIT-010.1`–`.3` hold.

## Acceptance criteria added by this Work Order

Conditions of `done`, and the substance Karl's ACs must cover.

1. **The driver passes `@paver/qb`'s own conformance suite inside kit's build, over a real Postgres.**
   Not a stub. This is the package's self-grade; the consumers' grades over their production routes
   are separate and are theirs (`AC-KIT-009.29`).
2. **An exchange-intent row is committed in a separate transaction before Intuit is called.**
   kit ADR-001 claimed `generation` and `rotated_at` "distinguish 'we exchanged and lost the result'
   from 'we never exchanged'". **They cannot** — both are written inside the transaction that rolls
   back, so a function frozen or killed after the exchange returns leaves state byte-identical to
   "we never exchanged", and the advisory lock releases on disconnect. **Boris withdrew that claim in
   place (Blueprint Revision 3) and specified the committed intent row**; cargo ADR-020's restatement
   is withdrawn with it. Commit the intent first, clear it after the rotated record is durably
   written. The driver owns the statements; `WO-CARGO-020`'s migration `0026` owns the table.
   **What this AC specifies is DETECTION, and only detection.** The response to a stranded intent —
   `ReauthorizationRequired` versus a bounded retry — is **not specified here and must not be
   guessed**: it turns on whether Intuit honours a grace window for the prior refresh token, which is
   unsourced (`@REQ-KIT-008` Open Question 2). See `spec-first-refresh-grace-window` under Blockers.
3. **`describe()` reports what was actually opened.** Lock scope, isolation level and whether
   prepared statements are disabled — read from the session, not from a constant. A conformance
   record that states what the driver claims rather than what it did is not a grade.
4. **The driver imports no database library.** A test asserts `@paver/qb/postgres`'s built graph
   contains no `pg`, `postgres`, `@neondatabase/*` or equivalent, and that
   `AC-KIT-010.1`–`.3` still hold from this entry point.
5. **A session-scoped lock is impossible to write by accident.** The lock statement is one function,
   used everywhere, and a test asserts the driver's SQL contains no `pg_advisory_lock(` outside a
   transaction-scoped form. *(This is the failure that reaches production silently: it works
   perfectly on a direct connection from a laptop and breaks only under the pooler both consumers
   deploy over.)*
6. **Contention is bounded and fails closed.** `lock_timeout` refuses and writes nothing. A test
   proves a waiter that times out performs no exchange and returns no token.
7. **The `Queryable` contract is small enough that a consumer cannot satisfy it wrongly.** Two
   methods, documented, with a worked example per consumer runtime. A consumer that hands in a
   client which silently opens its own transaction per statement must fail the suite, not pass it.

## Blueprints

`@blueprint:paver-qb-guarded-quickbooks-client` (**Revision 4**) — **ADR-010** (the driver ships from
`@paver/qb/postgres` taking an injected `Queryable`; both consumers connect over **one** production
route so one grade means something), **ADR-001** (the lock protocol and schema; its
`generation`/`rotated_at` **recovery claim is withdrawn** and replaced by the committed
exchange-intent row, which `ExchangeIntent` in Integration Contracts now names), **ADR-002** (one
Intuit application, one lineage, one shared store — and under D4 one **cross-product** lock).
`@blueprint:cargo-container-blueprint` (**Revision 5**) — **ADR-020** (the route is measured:
`aws-1-us-west-2.pooler.supabase.com:6543`, three IPv4 A records, transaction mode; the `aws-0`/
`aws-1` hostname trap; the driver is not Cargo's to write).

## E2E Acceptance Tests

| COV | Covers |
|---|---|
| `COV_KIT_031` | Added AC 1 — the shipped conformance suite, cross-process criteria enabled, green against `#PostgresAdvisoryLockTokenDriver` and a real Postgres |
| `COV_KIT_032` | Added ACs 3, 5 — `describe()` reports the isolation level and lock scope read from the session; no session-scoped lock form appears in the driver's SQL; a killed holder's lock is released and a second process acquires (`AC-KIT-009.28` from the driver's side) |
| `COV_KIT_033` | Added AC 2, **detection half only** — a holder killed after a successful exchange leaves a **committed intent row** that the next call finds, where `generation` and `rotated_at` alone would show it byte-identical to "never exchanged". The row's *consequence* is deliberately not asserted until `spec-first-refresh-grace-window` closes |
| `COV_KIT_034` | Added ACs 4, 7 — the `@paver/qb/postgres` built graph imports no database library and reaches no `node:fs`/`node:path`/`node:child_process`; a `Queryable` that opens its own transaction per statement **fails** the suite |
| `COV_KIT_035` | Added AC 6 — `lock_timeout` refuses, performs no exchange and returns no token |

## Verification

| Signal | Command | Pass condition |
|---|---|---|
| Types | `npx tsc --noEmit` | exits 0 |
| Build | `npm run build` (kit) | exits 0; `@paver/qb/postgres` emits ESM + `.d.ts` |
| Tests | package test runner | green, and tests-run matches test-files-on-disk |
| Conformance | `COV_KIT_031` | green, with real spawned OS processes against a real Postgres |
| Surface guard | `COV_KIT_034` | the new entry point's built graph is clean |
| Broken-driver control | `COV_KIT_032` | the deliberately session-scoped reference driver **fails** — a suite that has never failed anything has graded nothing |
| Install | `npm i github:paver-os/kit#qb-v1.1.0` in a scratch dir | exits 0, no registry token |

**No QuickBooks write and no live token exchange under this Work Order.** Every exchange is against a
stub transport. Reading or rotating a real token is `WO-CARGO-020`'s and `WO-026`'s ground.

## Blockers on `open/` → `in-progress/`

| Revision 2 blocker | Status |
|---|---|
| `karl-ac-shared-driver` | **CLOSED** — `AC-KIT-009.30`, `.31` (`@REQ-KIT-008` Revision 4, Foreman R7) |
| `karl-ac-consumer-runs-suite` | **CLOSED** — `AC-KIT-011.30` (`WO-CARGO-020`) and `AC-KIT-011.31` (`WO-026`) |
| `bootstrap-operator-approval` | **RE-OPENED, narrowed, and renamed `bootstrap-operator-approval-exchange-intent` — Foreman ITEM 2, 2026-08-14.** Revision 3 retired it in full. That was too wide: `AC-KIT-009.30`/`.31` authorize the **driver**, and nothing authorizes the **exchange-intent row** — this Work Order's added AC 2, and the mechanism the whole stranded-exchange story rests on. See below |

**The retirement was over-wide, and this is the correction.** Revision 3 read "the Requirement line
is no longer `NONE`" and closed the declaration. Both halves of that sentence are true and the
conclusion does not follow. `AC-KIT-009.30` requires the package to export a database-backed custody
driver and `.31` requires it to take an injected handle. **Neither says a row is committed before
Intuit is called.** The exchange-intent row is specified only in
`@blueprint:paver-qb-guarded-quickbooks-client` **ADR-001** (Revision 4) — architecture with no
Requirement behind it, which is the same class of gap `karl-ac-shared-driver` closed for the driver
and `@REQ-KIT-008` Revision 5 closed for the adapter. It is not a small one: without the intent row
the driver cannot tell a lost exchange from no exchange, and `COV_KIT_033` is asserting behaviour no
criterion requires.

**What is NOT done about it, deliberately.** The gap is not closed by writing the AC here and it is
not closed by pointing at an existing one. Karl declined to author against the unsourced Intuit
behaviour, and `@REQ-KIT-008` Open Question 2 is the honest record of that. A Work Order that quotes
a criterion it invented reports its own authority as Karl's.

| Field | Value |
|---|---|
| Blocker | `bootstrap-operator-approval-exchange-intent` |
| Scope | **added AC 2 only** — the committed `qb_token_exchange_intent` row and its separate transaction. Every other deliverable in this Work Order is covered by `AC-KIT-009.30`/`.31` and is not in bootstrap mode |
| Requirement | `NONE — bootstrap mode` |
| Blueprint | `@blueprint:paver-qb-guarded-quickbooks-client` ADR-001 (Revision 4) — present |
| Needs | Tony's explicit approval plus a bootstrap-log declaration before `open/` → `in-progress/` |
| Remediation | `karl-ac-exchange-intent-detection` — one AC in `@REQ-KIT-009` for the **detection** half. Routed to Karl. Remediation date **2026-08-21** |
| Owner | Tony Davis (approval) · Karl Strunk (remediation) |

**Why the remediation is authorable today and the pause below still is not.** They are different
questions and Revision 3 collapsed them. *Detection* — that a row is committed in its own transaction
before the exchange, and cleared after the rotated record is durably written — is a property of the
driver's own transactions, testable against a real Postgres with no Intuit reference in hand;
`COV_KIT_033` already tests exactly that. *Response* — what a later caller does on finding a
stranded row — turns on Intuit's grace-window behaviour and cannot be authored or guessed. Karl can
write the first without touching the second. Until he does, this Work Order's principal safety
mechanism runs on an operator's signature rather than on a criterion, and that is what the
declaration records.

**Gating, stated plainly:** this changes nothing about the sequence. `blocked-by: [WO-KIT-001]`
already prevents this Work Order from starting, so the approval is owed **before** the transition,
not today — but it is owed, and it must not be discovered at transition time.

**`blocked-by: [WO-KIT-001]` is the whole gate**, and it is real: this driver satisfies a contract
and is graded by a suite that Work Order ships. It cannot leave `open/` until `WO-KIT-001` is in
`done/`.

**One in-build hard pause remains — `spec-first-refresh-grace-window`, and it is new.** Added AC 2
below is correct that `generation` and `rotated_at` cannot distinguish "we exchanged and lost the
result" from "we never exchanged" — both are written inside the transaction that rolls back, and the
advisory lock releases on disconnect. Boris withdrew kit ADR-001's contrary claim and specified the
committed intent row, which makes the state **detectable**. What is still unspecified is the
**response**: whether a stranded intent must end in `ReauthorizationRequired` or in a bounded retry
turns on whether Intuit honours a grace window for the prior refresh token, and that is **unsourced**
in this chain. Karl declined to author the AC blind and recorded it as `@REQ-KIT-008` Open Question 2.

Consequence for this build, stated so it is not discovered at implementation time: **ship the
detection, pause before the response.** The intent row, its separate commit, and `COV_KIT_033`'s
assertion that a killed holder leaves a committed row are all shippable now. The line in added AC 2
that reads "a stranded intent ends in `ReauthorizationRequired`" is a **guess wearing a modal verb**
until the reference is read. What must be read: an **Intuit OAuth 2.0 reference on refresh-token
rotation** stating whether the prior refresh token remains valid for any window after a successful
exchange. Record the citation in the scratch dir; then Karl writes one AC in `@REQ-KIT-009` and this
pause closes. Do not implement the response from either assumption — the conservative one (always
refuse) costs a re-consent on every lost response, and the optimistic one (retry) is how a connection
dies.

## Notes

- The driver is the reason `WO-026` can list a real blocker instead of an unnameable one. Before
  ADR-010, Ledger's dependency was on a file in Cargo's repository; now it is on a tag.
- `AC-KIT-009.29` means both consumers connect over the **same** route — the transaction pooler —
  including Ledger, which could reach the IPv6-only direct host from a Mac. Two routes would mean
  two grades, one of which nobody runs.
- Nothing here holds a credential. `SUPABASE_DB_PASSWORD` and `CARGO_QB_TOKEN_SECRET` are key names
  only, held by consumers, recorded in `WO-CARGO-020`.
