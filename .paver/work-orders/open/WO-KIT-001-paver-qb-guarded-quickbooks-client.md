---
owner: builder
blocks: [WO-KIT-002, WO-CARGO-020, WO-CARGO-022, WO-CARGO-023, WO-CARGO-026, WO-026]
blocked-by: []
open-blockers: [spec-first-privatenote-OQ3]
---

# WO-KIT-001: Extract `@paver/qb` — the guarded QuickBooks write path

> **Repo:** `paver-os/kit` · **First Work Order in this root.** Hand-written: `wo:create` derives its
> namespace from existing Work Orders and refuses a root with none ([[new-project-root-bootstrap]]).
> The ID form `WO-KIT-NNN` follows this repo's own `REQ-KIT-NNN` / `AC-KIT-NNN` prefix and Cargo's
> namespaced precedent, not Ledger's bare `WO-NNN`. COV ids follow at `COV_KIT_NNN`.
>
> **Revision 5 — 2026-08-14 (Foreman ITEM C.3, C.4, R20, R24). `boris-adapter-imports-R13` IS CLOSED
> AND `open-blockers` NOW HOLDS ONE ENTRY.** `@blueprint:paver-qb-guarded-quickbooks-client`
> **ADR-016** rules R13: the adapter **interface**, `AdapterCapabilities`/`AdapterName`/
> `declareCapabilities`/`unsupportedMethods`/`CapabilityUnavailable` and the method-group **dispatch**
> cross with `self-hosted.ts`; the routing **map**, `#CapabilityDiffer`'s **measurement** and
> `#HostedAdapter` stay in Ledger. `AC-KIT-010.25` forces the package to own the interface regardless,
> so this was never avoidable. **Eleven Acceptance Criteria join the claim** from `@REQ-KIT-008`
> Revision 6: `AC-KIT-010.28`–`.36` (**the exported reference read**, ITEM B — without it
> `AC-CARGO-018.48` and `AC-KIT-011.42` closed every path between them) and `AC-KIT-010.26`/`.27`
> (**the dated capability declaration**, which is the reason the sole exportable adapter refuses every
> create as measured today — see the new note under Blockers). This Work Order now claims 144 criteria
> and `blocks` gains `WO-CARGO-026`.
>
> **Revision 4 — 2026-08-14, re-synced against `@REQ-KIT-008` Revision 5 and the file-home ruling
> (Foreman ITEM 3, R16, R17).** **This Work Order no longer says where any file lives. It cites the
> ADR that does.** Five rows of the In Scope table below contradicted
> `@blueprint:paver-qb-guarded-quickbooks-client` **ADR-014** and `@blueprint:quickbooks-connector`
> **ADR-008**, written the same session, in **both directions** — and this Work Order is the root of
> the graph, so it is the first thing a builder reads. `capability-differ.ts`, `router.ts` and
> `capabilities.ts` were listed as moving; both Blueprints keep them in Ledger and no Acceptance
> Criterion names them. `self-hosted.ts` and `rest-client.ts` were listed as moving, which the ADRs
> and now `AC-KIT-010.21` / `AC-KIT-011.35` confirm — that row was right and `WO-026` was the stale
> one. Five Acceptance Criteria are added to the claim (`AC-KIT-010.21`–`.25`), and one new blocker
> is declared: `boris-adapter-imports-R13`.
>
> **Revision 3 — 2026-08-14, re-synced against `@REQ-KIT-008` Revision 4 and
> `@blueprint:paver-qb-guarded-quickbooks-client` Revision 3 (Foreman R6, R9, R12).** The
> authorization widening lands here as a **verbatim re-sync, not new scope**: fourteen quotations
> below were stale the moment Karl re-cut `@REQ-KIT-012` from create methods to **write** methods,
> and a stale verbatim quotation reports this revision's change as this Work Order's failure. Nine
> Acceptance Criteria are added to the claim (`AC-KIT-008.43`, `.44`; `AC-KIT-009.32`, `.33`;
> `AC-KIT-010.20`; `AC-KIT-012.29`, `.30`, `.31`, `.32`) and `AC-KIT-010.11` is re-cut narrower.
> The `operator-decision-attribution-OQ2` blocker is **closed by operator decision D4**.
>
> **Revision 2 — 2026-08-14, reconciled against `@REQ-KIT-008` Revision 3 and
> `@blueprint:paver-qb-guarded-quickbooks-client` Revision 2.** Three things changed: added-AC 2 is
> **withdrawn** (Foreman F1 — it reasoned from a premise ADR-009 falsifies); the whole guarded
> contract, the break-glass path and the provenance stamp enter scope; and the Postgres custody
> driver leaves this Work Order for `WO-KIT-002` rather than for Cargo (ADR-010).

## Summary

Ledger holds a working guarded path for creating a QuickBooks bill — five gates and a post-write
re-read, in one file, reachable only from a one-shot local CLI. Cargo needs the same write from a
button on a serverless function. Copying the gates is what writes a wrong bill, so the path is
**extracted** into `@paver/qb` and both products consume it as a pinned dependency.

This Work Order builds the package: the contract, the gate chain, the **guarded contract** every
write in both products dispatches through, the grant table that partitions QuickBooks by originating
system, the break-glass entry point and the provenance stamp, the plan builder that binds the
approval to the bytes dispatched, the post-write verifier, the token-custody **interface** and its
cross-process conformance suite, the pure cipher, and the serverless-surface guard. It ships **no**
filesystem token driver, **no** subprocess adapter, and **no** tenant-config loader.

It is the first of two Work Orders in this repo and the only one that ships the gates. Everything
downstream consumes it. It publishes tag `qb-v1.0.0`; no consumer adopts under this Work Order.

## In Scope

Moved from Ledger, made pure, and re-homed under `@paver/qb`.

> **This table does not decide where a file lives. It records what the ADR decided.** The single
> ruling on which QuickBooks adapter crosses is `@blueprint:paver-qb-guarded-quickbooks-client`
> **ADR-014**, cited by `@blueprint:quickbooks-connector` **ADR-008**; the single ruling on the
> contract is **ADR-009**. A builder who finds this table disagreeing with either ADR follows the
> ADR and surfaces the table to Foreman. Do not re-derive a file's home from a Work Order.

| From Ledger | Disposition |
|---|---|
| `src/qb/contract.ts` | move **WHOLE** — ADR-009. Not trimmed to the exposed create set. The raw contract stays internal; the package exports the composed **guarded** contract |
| `method-groups.ts` | move; already pure. Named by no ADR as staying, and both `contract.ts` (ADR-009) and the grant table need it |
| `capabilities.ts`, `router.ts` | **SPLIT — kit ADR-016, which closes R13.** Revision 4 said both stay whole and flagged the result as not buildable. It is now decided, and the answer is neither "both move" nor "both stay". **Crosses:** the `Adapter` **interface**, `AdapterCapabilities`, `AdapterName`, `declareCapabilities`, `unsupportedMethods`, `CapabilityUnavailable`, and the method-group **dispatch** — everything `self-hosted.ts:22-24` imports, which `AC-KIT-010.24` puts inside `AC-KIT-010.4`'s walk, and which `AC-KIT-010.25` obliged the package to own in any case. **Stays in Ledger:** the routing **map** (`RoutingMap`), `#CapabilityDiffer`'s **measurement**, and `#HostedAdapter`. `#AdapterRouter` is **reduced to configuration, not deleted**. Cargo supplies no map, so every method group defaults to the exported adapter |
| `src/qb/guarded.ts` | move; becomes `#GuardedWriteDispatcher`, the only exported write surface (`AC-KIT-008.35`–`.39`, `.42`) |
| `src/qb/creation-policy.ts` | move the **primitive** — and **not** its name or its early exit. Re-key the table on `ConsumerWorkflow`, add `GrantKind` (ADR-003, ADR-011), and widen the grant set from create methods to **write** methods (`AC-KIT-012.1`). `assertMayCreate`'s `if (!isCreation(method)) return` (`creation-policy.ts:80-85`) is the authorization hole and does **not** cross: the replacement is one membership test (`AC-KIT-008.44`) in `#GrantSetMembershipGate` (kit ADR-013), which `#BillCreationGateChain` and `#GuardedWriteDispatcher` both call and neither branches inside. All thirteen identities live here — Ledger's eleven non-create workflow names arrive holding `updateBill` / `updateBillPayment` / `updatePurchase` (`AC-KIT-012.29`, `.31`, `.32`), **not** empty sets |
| `src/qb/approval-gate.ts`, `write-verifier.ts` | move |
| `src/qb/adapters/self-hosted.ts`, `rest-client.ts` | move — **kit ADR-014 is the single ruling**, and Revision 5 gives it a Requirement: `AC-KIT-010.21` (the package exports an adapter), `AC-KIT-010.22` (no more than one that sends), `AC-KIT-011.35` (Ledger deletes both). Both are already serverless-clean and `rest-client.ts:37,47,52` takes `fetchImpl` injected, which is `AC-KIT-010.10` satisfied by construction. `WO-026` Revision 3 listed them as staying in Ledger; that was the stale document and is corrected |
| `src/qb/adapters/stub.ts` | move — the contract's test double; every adapter test in this Work Order runs against it |
| `src/qb/adapters/capability-differ.ts` | **STAYS IN LEDGER** — kit ADR-014 ("keeps `#CapabilityDiffer` out of the package"), `@blueprint:quickbooks-connector` ADR-008 (names it) and ADR-002 (the differ is where the measurement discipline lives). Measured: `capability-differ.ts:3` types against `./mcp-stdio-client.js`, the subprocess connector `AC-KIT-010.3` excludes. Revision 3 listed it as moving; no ADR and no Acceptance Criterion said so. **Path corrected in connector Revision 4: it is at `src/qb/adapters/`, not `src/qb/`** — that Blueprint's `:127` was wrong and is fixed |
| `src/qb/oauth.ts` | move; `node:crypto` only, `fetch` injected — Node runtime, not Edge |
| `src/qb/token-store.ts` | move the **interface** + `encryptRecord`/`decryptRecord` verbatim. `FileTokenStore` does not cross (`AC-KIT-010.6`) |
| `src/qb/adapters/hosted.ts`, `adapters/mcp-stdio-client.ts` | **excluded** — `node:fs`, `node:child_process` |
| `src/plan/change-plan.ts` | **split**: the module-level `node:fs` import (`change-plan.ts:1-2`) moves to a `readPlan`/`writePlan` module that stays in Ledger; the hash + `derivePlanId` functions (`:143-145`) come across filesystem-free (`AC-KIT-010.5`) |
| `presentPlan` (`cli.ts:8`, `expense-review.ts:6`) | move and export — the plan's shape is the package's, so its renderer is too (`AC-KIT-008.41`) |
| `src/workflows/vendor-bill.ts` `planVendorBill` (`:834`) / `applyVendorBill` (`:1030`) | the gate chain and the post-write re-read (`:1099-1133`) come across; the file already takes router/config/clock as injected arguments and imports no `node:*` |

New in the package, decided by Blueprint, not present in Ledger:

- `ConsumerWorkflow` closed union + `CapabilityGrantTable` keyed on it, each grant carrying a
  `GrantKind` field — not a naming convention (ADR-003, ADR-011 part 2).
- **One exported entry point per consumer, each closing over its own identity.** There is no
  public argument through which a caller names its identity. (Review finding: Ledger's call site
  takes it as an argument — `tokenFor(input.workflow ?? 'vendor-bill')`, `vendor-bill.ts:1052` —
  so a caller could pass another consumer's identity and be *granted*, not refused.)
- **`#GuardedWriteDispatcher`** — approved-change dispatch plus post-write re-read for creates **and**
  non-creates, every method behind a capability token, **authorized identically** (`AC-KIT-008.37`,
  `.43`, `.44`). It holds no create/non-create branch; it delegates to `#GrantSetMembershipGate`
  (kit ADR-013). It leaves the provenance field untouched on a non-create write (`AC-KIT-012.30`).
  This is what `reconcile` and `expense-review` use after `AC-KIT-011.2` deletes `guarded.ts` from
  Ledger (ADR-009).
- **`#GrantSetMembershipGate`** — the whole authorization decision in one node (kit **ADR-013**):
  membership of the method in the token's grant set, nothing else asked. There is deliberately **no
  `CreateMethod` type** in the public vocabulary — `WriteMethod` is the type and creates are a subset
  of its values, so a future author adding a write method cannot pick the wrong rule block.
- **The break-glass entry point** — a separate module the default entry point does not re-export,
  taking a required reason, invoked by nothing inside the package (ADR-011 part 3).
- **`#BillProvenanceStamper`** — identity, grant kind and (break-glass only) reason written into the
  created bill, composed with the idempotency marker so the marker stays exactly matchable
  (`AC-KIT-012.23`–`.25`, `AC-KIT-008.40`; ADR-005 composition rule).
- **`#GrantPartitionChecker`** — a **function over a supplied grant table** (`AC-KIT-012.13`), not a
  hard-coded assertion (ADR-012).
- `VendorBillPlanBuilder` — the package builds the `ChangePlan` from the `CreateBillPayload` the
  consumer hands it, so the hashed bytes are the dispatched bytes (ADR-004).
- Idempotency marker derived from plan content, written into the bill and probed for (ADR-005).
- A **truncation channel** on the search contract, so a truncated result set is distinguishable
  from an absence (`AC-KIT-008.31` is untestable without it).
- **A caller-supplied timeout on every outbound request**, and a README statement of how many run in
  sequence (`AC-KIT-010.17`, `.18`) — the number Cargo's `maxDuration` budget is sized against
  (`@blueprint:cargo-container-blueprint` ADR-023).
- **`#ReferenceIdentifierReader`** — the exported reference read (**ADR-015**, `AC-KIT-010.28`–`.36`).
  Resolves an account, class, item or vendor **by its QuickBooks identifier** and returns the name
  QuickBooks holds, or nothing. **Ungated** — no capability token, because a read changes nothing
  (`.35`) — but dispatched through the same adapter surface as a write (`.34`) and taking its token
  from the same custody path (`.36`). It exists because `AC-KIT-011.42` forbids Cargo constructing
  the request and `AC-CARGO-018.48` requires the read: without it, `WO-CARGO-026`'s
  `#QbReferenceVerifier` has no permitted path at all. **The wire form is this Work Order's to decide
  under spec-first** — `rest-client.ts:130` interpolates a `WHERE` clause today; whether the read is
  a filter query or a read-by-identifier endpoint must be checked against the Intuit reference before
  it is written, not guessed. Record the citation in the scratch dir alongside the `PrivateNote` one.
- **A dated capability declaration on the exported adapter** (`AC-KIT-010.26`). Not a formality: the
  gate at `AC-KIT-008.21` refuses a create against an undated declaration, and the adapter declares
  `measuredAt: null` today.
- `GATE_CONTRACT_VERSION` (ADR-008). Starts at **1**.
- `CustodyConformanceSuite` — cross-process, spawning real OS processes, graded over an injected
  connection route rather than a stub (`AC-KIT-009.29`).
- `ServerlessSurfaceGuard` — walks the **built** transitive graph, not the source directory.

## Out of Scope

- **The Postgres custody driver — `WO-KIT-002`, in this same repo.** ADR-010 moved it out of Cargo:
  it ships from `@paver/qb/postgres` taking an injected `Queryable`, because a driver inside Cargo's
  repository is one Ledger cannot import. This Work Order ships the **interface** and the **suite**;
  `WO-KIT-002` ships the implementation graded by that suite.
- The `qb_token` table, the connection, the pool budget and the conformance **run** — Cargo's,
  `WO-CARGO-020`; Ledger's connection, `WO-026`.
- Vendor / account / class mapping data — Cargo's, `WO-CARGO-021` (`AC-KIT-010.9`).
- The preview screen — Cargo's, `WO-CARGO-022`.
- `createItem` and every other create method beyond `createBill` and the methods `contract.ts`
  already declares. `createJournalEntry` crosses **on the exposed create set, granted to nobody**
  (ADR-009, `AC-KIT-012.28`) — that is a decision, not an omission. Adding `Item` later is a table
  edit, a contract addition and a version bump (`AC-KIT-012.10`, `.11`) — a declared capability
  change, and `AC-KIT-012.14`'s fixture is what proves the partition test survives it. **No
  Requirement authorizes the Item work; it is not designed here.**
- Migrating Ledger — `WO-026`. Migrating Cargo — `WO-CARGO-023`. This WO publishes the tag; it does
  not consume it.

## Requirements

Cited verbatim from
`@artifact:projects/kit/.paver/requirements/frds/REQ-KIT-008-paver-qb-guarded-quickbooks-client.md`
(**Revision 6**).

### @REQ-KIT-008 — the guarded write path (all 44 criteria claimed here)

- **AC-KIT-008.1:** When a caller invokes a create path with a capability token that does not grant that create method, the package shall refuse.
- **AC-KIT-008.2:** The package shall build every capability token from the grant table defined inside the package, and shall not accept a grant set supplied by a caller.
- **AC-KIT-008.3:** When the change plan carries no approval, the package shall refuse.
- **AC-KIT-008.4:** When the plan hash recomputed from the plan's changes differs from the approved plan hash, the package shall refuse.
- **AC-KIT-008.5:** When the decision hash recomputed from the plan's changes differs from the approved decision hash, the package shall refuse.
- **AC-KIT-008.6:** When the plan carries any change other than the single bill to be created, the package shall refuse.
- **AC-KIT-008.7:** When the item to be written carries no operator decision, the package shall refuse.
- **AC-KIT-008.8:** When the item to be written carries a skip decision, the package shall refuse.
- **AC-KIT-008.20:** When the QuickBooks adapter that would receive the create does not accept a class reference on every bill line, the package shall refuse.
- **AC-KIT-008.21:** When that adapter's capability declaration carries no measurement date, the package shall refuse.
- **AC-KIT-008.22:** The package shall expose no argument, flag, or option that disables any gate named in this Requirement.
- **AC-KIT-008.23:** The package shall construct the change plan from the create payload supplied by the caller, and shall carry that payload as the plan's single proposed value.
- **AC-KIT-008.24:** The package shall dispatch the payload carried by the approved plan, and shall not re-derive a payload between the approval check and the dispatch.
- **AC-KIT-008.25:** The package shall read the approved total and the approved line count from the approved payload, and shall not recompute them from any other source.
- **AC-KIT-008.9:** Immediately before dispatching the create, the package shall query QuickBooks for an existing bill holding the same vendor identifier and the same document number.
- **AC-KIT-008.10:** When the query in AC-KIT-008.9 returns a bill, the package shall refuse and shall name the existing bill in the error.
- **AC-KIT-008.26:** When the create payload carries no document number, the package shall refuse.
- **AC-KIT-008.27:** The package shall derive an idempotency marker from the change plan's content.
- **AC-KIT-008.28:** The package shall write the idempotency marker into the created bill in a field QuickBooks returns on a read.
- **AC-KIT-008.29:** Immediately before dispatching the create, the package shall query QuickBooks for an existing bill carrying the same idempotency marker.
- **AC-KIT-008.30:** When the query in AC-KIT-008.29 returns a bill, the package shall refuse and shall name the existing bill in the error.
- **AC-KIT-008.31:** When a search underlying AC-KIT-008.9 or AC-KIT-008.29 returns a truncated result set, the package shall refuse rather than treat the result as an absence.
- **AC-KIT-008.40:** The package shall write the idempotency marker in a form the query in AC-KIT-008.29 matches exactly when the same field also carries the provenance stamp required by AC-KIT-012.23.
- **AC-KIT-008.11:** After a create succeeds, the package shall fetch the created bill from QuickBooks by the identifier the create returned.
- **AC-KIT-008.12:** The package shall derive the reported total and the reported line count from the fetch in AC-KIT-008.11, and shall derive neither from the create response.
- **AC-KIT-008.13:** When the fetched total differs from the approved total by 0.005 or more, the package shall report the write as not verified.
- **AC-KIT-008.14:** When the fetched line count differs from the approved line count, the package shall report the write as not verified.
- **AC-KIT-008.32:** When the fetched vendor identifier differs from the approved vendor identifier, the package shall report the write as not verified.
- **AC-KIT-008.15:** When a write is reported as not verified, the package shall name which field differed, the approved value, and the fetched value.
- **AC-KIT-008.16:** When a write is reported as not verified, the package shall return rather than refuse, because the bill already exists in QuickBooks and an error would discard the only record of it.
- **AC-KIT-008.17:** When the fetch in AC-KIT-008.11 fails, the package shall return the created bill's identifier and shall report the write as not verified.
- **AC-KIT-008.18:** The package shall return the created bill's QuickBooks identifier to the caller on every path where a create succeeded.
- **AC-KIT-008.33:** When the create request fails before a response is received, the package shall report that the bill's existence is unknown, and shall not report the create as failed.
- **AC-KIT-008.34:** When the create request fails before a response is received, the package shall return the idempotency marker to the caller.
- **AC-KIT-008.19:** The package shall run its gates in this order — plan shape (AC-KIT-008.6), capability (AC-KIT-008.1), approval hashes (AC-KIT-008.3 through AC-KIT-008.5), item decision (AC-KIT-008.7, AC-KIT-008.8), class capability (AC-KIT-008.20, AC-KIT-008.21), payload completeness (AC-KIT-008.26), duplicate probes (AC-KIT-008.9, AC-KIT-008.29) — and shall send no QuickBooks request other than the duplicate probes until every preceding gate has passed.
- **AC-KIT-008.35:** The package shall expose the dispatch of an approved non-create change to QuickBooks as a method on the guarded contract.
- **AC-KIT-008.36:** The guarded contract shall require a capability token on every write method it exposes.
- **AC-KIT-008.37:** When a caller invokes a create method through the guarded contract with a capability token that does not grant that create method, the package shall refuse.
- **AC-KIT-008.43:** When a caller invokes a non-create write method through the guarded contract with a capability token that does not grant that write method, the package shall refuse.
- **AC-KIT-008.44:** The package shall determine whether a capability token permits a write method by that method's membership in the token's grant set alone.
- **AC-KIT-008.38:** The package shall re-read every record written through AC-KIT-008.35.
- **AC-KIT-008.42:** The package shall derive the verification result of a write dispatched through AC-KIT-008.35 from the re-read in AC-KIT-008.38, and shall derive it from no part of the write response.
- **AC-KIT-008.39:** The package shall export no path that dispatches a QuickBooks write without a capability token.
- **AC-KIT-008.41:** The package shall export the function that renders a change plan's proposed changes for operator review, because the change plan's shape is defined by the package.

### @REQ-KIT-009 — token custody (claimed here: .1–.13, .15–.29, .32, .33; **.14 is claimed by `WO-CARGO-020`; .30 and .31 by `WO-KIT-002`**)

- **AC-KIT-009.1:** The package shall define token custody as an interface offering a read operation, a locked read-modify-write operation, and a description operation.
- **AC-KIT-009.2:** The package shall depend on no specific storage medium for token custody, and shall accept any value satisfying the interface in AC-KIT-009.1.
- **AC-KIT-009.3:** The package shall perform every refresh-token exchange inside the locked operation.
- **AC-KIT-009.17:** The package shall re-evaluate the freshness of the token record read inside the locked operation, and shall return that record without exchanging when it is still valid.
- **AC-KIT-009.18:** The package shall ship a test in which two locked operations run in sequence against one stub driver holding an expired record, and that test shall fail unless exactly one exchange occurred.
- **AC-KIT-009.8:** When a refresh exchange returns a rotated refresh token, the package shall write the returned record through the custody driver before returning any token to the caller.
- **AC-KIT-009.9:** When the write in AC-KIT-009.8 fails, the package shall refuse and shall not return the new access token, because a rotated token that was used but not stored ends the connection.
- **AC-KIT-009.19:** When the package refuses under AC-KIT-009.9, it shall raise the same named error it raises under AC-KIT-009.10, so that one error means "re-authorize" on every path that ends the connection.
- **AC-KIT-009.10:** When the stored refresh token is past its expiry, the package shall refuse without attempting an exchange, and shall state that re-authorization is needed.
- **AC-KIT-009.22:** When the token record read outside the lock is fresh, the package shall return it without taking the lock.
- **AC-KIT-009.23:** The package shall bound the refresh-token exchange with a caller-supplied timeout.
- **AC-KIT-009.24:** When the timeout in AC-KIT-009.23 elapses, the package shall abandon the exchange.
- **AC-KIT-009.25:** When the package abandons an exchange under AC-KIT-009.24, it shall write no token record.
- **AC-KIT-009.26:** When the package abandons an exchange under AC-KIT-009.24, it shall refuse.
- **AC-KIT-009.27:** The package shall perform no outbound request other than the refresh-token exchange while the locked operation is open.
- **AC-KIT-009.4:** The package shall ship a conformance suite that a token-custody driver runs against itself.
- **AC-KIT-009.5:** The conformance suite shall run its concurrency criteria across separate operating-system processes contending for one stored record, not across concurrent calls within one process.
- **AC-KIT-009.6:** The conformance suite shall fail a driver that permits two processes to hold the lock over one tenant key at the same time.
- **AC-KIT-009.7:** The conformance suite shall fail a driver whose locked operation permits a second caller to read the stored record before the first caller's write completes.
- **AC-KIT-009.20:** The conformance suite shall fail a driver that returns a record stored under a tenant key other than the one requested.
- **AC-KIT-009.21:** The conformance suite shall grade a driver on lock semantics and tenant scoping only, and shall not grade a driver on the number of exchanges performed.
- **AC-KIT-009.28:** The conformance suite shall fail a driver whose lock is still held after the process that took it exits without completing its operation.
- **AC-KIT-009.29:** The conformance suite shall run its criteria against the driver over the same connection route the consumer uses in production.
- **AC-KIT-009.11:** The package shall expose token-record encryption and decryption as functions that take the record and the secret as arguments and return or accept a string, holding no state and touching no storage.
- **AC-KIT-009.12:** The encryption and decryption functions shall refuse a secret shorter than 32 characters.
- **AC-KIT-009.13:** Decryption shall refuse a record whose authentication tag does not verify, and shall not distinguish a wrong key from an altered record in the error it raises.
- **AC-KIT-009.15:** When a caller reads or locks a record, the package shall scope that operation to one tenant key and shall not return a record stored under another.
- **AC-KIT-009.16:** The package's README shall name the environment-variable keys a consumer is expected to set for the client identifier, the client secret, and the token-encryption secret, and no file in the package shall record a value for any of them.
- **AC-KIT-009.32:** The package shall read the realm identifier it uses for a QuickBooks request from the token record it read under that request's tenant key.
- **AC-KIT-009.33:** The package shall accept no realm identifier as an argument separate from the tenant key.

> `AC-KIT-009.32` and `.33` are the **realm-binding fix**, and they are the package's half of it —
> `WO-CARGO-020` added AC 2 carried the substance while no Requirement did. They are why
> `AC-KIT-010.11` is re-cut below: a realm supplied beside the tenant key can disagree with the
> record, and the post-write re-read of `AC-KIT-008.11`/`.32` then verifies *successfully* against
> the wrong QuickBooks company. Removing the argument is the only fix that cannot be forgotten.

> `AC-KIT-009.29` is claimed here as a property of the **suite** — it takes the connection route as
> an injected value and refuses to grade a driver over anything else. The obligation on a *consumer*
> to actually run it over its production route is no longer an added AC with no Requirement behind
> it: Revision 4 writes it as `AC-KIT-011.30` (Cargo, claimed by `WO-CARGO-020`) and `AC-KIT-011.31`
> (Ledger, claimed by `WO-026`). Cargo container blueprint defect 4 is closed.

### @REQ-KIT-010 — the serverless surface (all 36 criteria claimed here)

- **AC-KIT-010.1:** No module reachable from the package's public entry points shall import `node:fs`.
- **AC-KIT-010.2:** No module reachable from the package's public entry points shall import `node:path`.
- **AC-KIT-010.3:** No module reachable from the package's public entry points shall import `node:child_process`.
- **AC-KIT-010.4:** The package shall ship a test that walks the transitive import graph of the built output of each public entry point and fails when it reaches any module named in AC-KIT-010.1 through AC-KIT-010.3.
- **AC-KIT-010.5:** The package shall expose the change-plan construction and hash functions from an entry point whose import graph reaches no filesystem module.
- **AC-KIT-010.6:** The package shall export no filesystem-backed token-custody driver.
- **AC-KIT-010.7:** The package shall export no QuickBooks adapter that communicates by spawning a subprocess.
- **AC-KIT-010.8:** The package shall read no configuration file at runtime.
- **AC-KIT-010.15:** The package shall read no environment variable at runtime.
- **AC-KIT-010.9:** The package shall take vendor, account, and class mapping as caller-supplied arguments.
- **AC-KIT-010.10:** The package shall accept its HTTP transport as an injected function, so that a consumer supplies its own runtime's fetch.
- **AC-KIT-010.11:** The package shall take the QuickBooks client identifier and client secret as caller-supplied configuration values. (The realm identifier is not among them — it is read from the token record per AC-KIT-009.32.)
- **AC-KIT-010.20:** The package shall export no QuickBooks adapter that cannot carry a class reference on every bill line.
- **AC-KIT-010.12:** `@paver/qb` shall depend on no other `@paver/*` package, so that either consumer adopts it in isolation.
- **AC-KIT-010.13:** The package shall be releasable and installable as a pinned git tag per @REQ-KIT-002.
- **AC-KIT-010.14:** The package shall build to output importable by a Node script and by a Next.js App Router route handler declared to run on the Node runtime, with type declarations, per AC-KIT-002.4.
- **AC-KIT-010.16:** The package's README shall state that its token path requires the Node runtime, because that path uses `node:crypto` primitives the Edge runtime does not provide.
- **AC-KIT-010.17:** The package shall bound every outbound request it makes with a caller-supplied timeout.
- **AC-KIT-010.18:** The package's README shall state the maximum number of sequential outbound requests the guarded write path performs, so that a consumer can size its function's execution limit against their sum.
- **AC-KIT-010.19:** When the create request's timeout elapses, the package shall report the bill's existence as unknown per AC-KIT-008.33.

*The adapter — `@REQ-KIT-008` Revision 5. Until these, ADR-014 was architecture with no Requirement behind it*

- **AC-KIT-010.21:** The package shall export a QuickBooks adapter that constructs and sends every QuickBooks request the guarded contract dispatches.
- **AC-KIT-010.22:** The package shall export no more than one QuickBooks adapter that sends a request to QuickBooks.
- **AC-KIT-010.23:** The adapter required by AC-KIT-010.21 shall send every request through the transport injected per AC-KIT-010.10.
- **AC-KIT-010.24:** The adapter required by AC-KIT-010.21 shall be reachable from a public entry point of the package, so that the walk required by AC-KIT-010.4 covers it and AC-KIT-010.1 through AC-KIT-010.3 hold over everything it imports.
- **AC-KIT-010.25:** The package shall accept a QuickBooks adapter supplied by the caller for a method group, so that a consumer may route a group at an adapter the package does not export.

*The adapter's declaration carries a date — `@REQ-KIT-008` Revision 6, ADR-014 Revision 4*

- **AC-KIT-010.26:** The adapter required by AC-KIT-010.21 shall carry a capability declaration recording the date on which its acceptance of a class reference on every bill line was measured.
- **AC-KIT-010.27:** The package shall hold no exemption by which a create proceeds when the receiving adapter's capability declaration carries no measurement date.

*The read the consumers are forbidden from writing — `@REQ-KIT-008` Revision 6, ADR-015. **ITEM B***

- **AC-KIT-010.28:** The package shall export a read that resolves a QuickBooks reference from an identifier the caller supplies.
- **AC-KIT-010.29:** The read required by AC-KIT-010.28 shall return the name QuickBooks holds for the identifier it resolved.
- **AC-KIT-010.30:** The read required by AC-KIT-010.28 shall resolve a reference of each kind a bill payload carries an identifier for — an account, a class, an item, and a vendor.
- **AC-KIT-010.31:** The read required by AC-KIT-010.28 shall accept no reference name as the value it resolves, because an account name on a transaction is fully qualified while a search returns the leaf, and leaf names collide.
- **AC-KIT-010.32:** When the identifier supplied to the read required by AC-KIT-010.28 resolves to no QuickBooks record, the package shall report that the identifier resolved to nothing.
- **AC-KIT-010.33:** When the read required by AC-KIT-010.28 fails, the package shall not report the result required by AC-KIT-010.32, because a failed read is not an absent record.
- **AC-KIT-010.34:** The package shall dispatch the read required by AC-KIT-010.28 through the same adapter surface it dispatches a write through, so that one request shape serves reads and writes.
- **AC-KIT-010.35:** The read required by AC-KIT-010.28 shall require no capability token, because a read changes nothing in QuickBooks.
- **AC-KIT-010.36:** The read required by AC-KIT-010.28 shall obtain its access token through the token custody of @REQ-KIT-009, so that no second credential path reaches QuickBooks.

> **`AC-KIT-010.28`–`.36` exist because two criteria written in the same revision closed every path
> between them.** `AC-CARGO-018.48` obliges Cargo to read a mapping identifier **from QuickBooks**
> before saving it; `AC-KIT-011.42` forbids any Cargo source file from constructing an Accounting API
> request; and this package exported no read at all. `#QbReferenceVerifier` could not do its job by
> any permitted path. **ADR-015** rules it: the package exports the read, ungated, because a read
> changes nothing (`.35`). **The wire form is deliberately not in any criterion** — filter query
> versus read-by-identifier endpoint is an Intuit API question and ADR-015 item 4 hands it to this
> Work Order under the spec-first rule. `rest-client.ts:130`'s interpolated `WHERE` is recorded as the
> starting point, not the answer.
>
> **`.32` and `.33` are the pair, and `.33` is the one a builder collapses by accident.** "The
> identifier resolved to nothing" is what `AC-CARGO-018.49` refuses a mapping save on. A 401, a socket
> reset or a QuickBooks 500 is **not** that, and reporting it as that tells an admin their correct
> account id is wrong. Same rule as `AC-KIT-008.31`, one entity over.
>
> **`.36` is why `WO-CARGO-026` is blocked on `WO-CARGO-020`.** The read takes the same token from the
> same custody path as a write — one credential path, one cross-product advisory lock. A mapping edit
> is therefore a second contender for that lock, rare but real.

> **`AC-KIT-010.26` and `.27`: as measured today, the only adapter this package may export refuses
> every create.** `AC-KIT-008.21` refuses a create when the receiving adapter's capability declaration
> carries no measurement date, and `self-hosted.ts:316` declares `measuredAt: null`. Ledger escapes it
> only through `PER_LINE_CLASSREF_BY_CONSTRUCTION` (`vendor-bill.ts:630-658`) — an exemption `.27`
> now forbids the package from acquiring. **This is ITEM A's failure shape on the kit side: a gate
> that refuses everything, for a reason no artifact named.** `.26` is the fix and it is a *measurement*
> task, not an unsourced question: measure the self-hosted REST adapter's acceptance of a per-line
> `ClassRef` and date the declaration. Do not port the by-construction exemption across, and do not
> ship `measuredAt: null` with a comment.

> **`AC-KIT-010.24` was the criterion that made `boris-adapter-imports-R13` a real blocker.
> R13 IS NOW CLOSED — `@blueprint:paver-qb-guarded-quickbooks-client` ADR-016.** It puts everything
> the exported adapter imports inside `AC-KIT-010.4`'s built-graph walk. `self-hosted.ts:22-24`
> imports `declareCapabilities` and `AdapterCapabilities` from `../capabilities.js` and the `Adapter`
> type from `../router.js`. ADR-016 rules that the adapter **interface**, the capability-declaration
> symbols and the method-group **dispatch** cross with the adapter; the routing **map**,
> `#CapabilityDiffer`'s **measurement** and `#HostedAdapter` stay in Ledger. `AC-KIT-010.25` already
> obliged the package to own the interface, so no criterion was needed and none was written — as
> Revision 5 of the FRD predicted. **The In Scope table's `capabilities.ts` / `router.ts` row is
> superseded by ADR-016 and is corrected below.** Measured 2026-08-14.
>
> **`AC-KIT-010.25` is what keeps Ledger's routing choice alive through `AC-KIT-011.35`'s deletion.**
> Ledger injects `#HostedAdapter` for any method group it later routes there
> (`AC-KIT-011.38`); the package exports neither it nor the subprocess connector
> (`AC-KIT-010.7`, `AC-KIT-010.20`). It is not a loophole on the Cargo side —
> `AC-KIT-011.43` forbids Cargo supplying an adapter at all, and a supplied adapter is still
> reached only through the guarded contract.

### @REQ-KIT-011 — claimed here: **.14 and .22 only**

- **AC-KIT-011.14:** The package shall export a gate-contract version constant that increments whenever the behaviour of any gate named in @REQ-KIT-008 changes.
- **AC-KIT-011.22:** When a release changes the gate-contract version, the release should be recorded in the Requirements drift log naming every consumer still pinned to an earlier tag.

### @REQ-KIT-012 — the **write-method** writer partition (all 32 criteria claimed here)

> **Re-synced verbatim against Revision 4 (Foreman R6).** Twelve of the quotations below and the
> Requirement's own title said *create method* where Revision 4 says **write method**. That is not a
> wording preference: under the old text a token granting exactly `['createBill']` satisfied every
> criterion in this block on `updateBill`, `updateBillPayment` and `updatePurchase`, and nothing
> refused it. A builder implementing the stale quotations would build the hole. The re-cut ids are
> `.1`, `.3`, `.6`, `.8`, `.9`, `.10`, `.11`, `.14`, `.15`, `.16`, `.18`, `.28` — same ids, same
> intent, wider subject — and four ids are new: `.29`, `.30`, `.31`, `.32`.

- **AC-KIT-012.1:** The package shall hold one grant table mapping each consumer workflow identity to the set of write methods that identity may call.
- **AC-KIT-012.2:** Each consumer workflow identity shall name the consumer system it belongs to.
- **AC-KIT-012.17:** Each grant in the grant table shall record whether it is a normal grant or a break-glass grant.
- **AC-KIT-012.3:** For each write method, the grant table shall record a normal grant to consumer workflow identities belonging to no more than one consumer system.
- **AC-KIT-012.16:** For each write method, the grant table shall record break-glass grants to consumer workflow identities belonging to no more than one consumer system.
- **AC-KIT-012.18:** For each write method, no consumer system shall hold both a normal grant and a break-glass grant.
- **AC-KIT-012.4:** The package shall ship a test that reads the grant table and fails when AC-KIT-012.3, AC-KIT-012.16, or AC-KIT-012.18 does not hold.
- **AC-KIT-012.5:** The grant table shall record a normal grant of `createBill` to a Cargo consumer workflow identity, because a factory bill originates in Cargo against a Cargo purchase order.
- **AC-KIT-012.7:** The grant table shall record a break-glass grant of `createBill` to a Ledger consumer workflow identity, because Ledger remains the path for a bill that cannot be posted from Cargo.
- **AC-KIT-012.29:** The grant table shall record a normal grant of `updateBill` to Ledger consumer workflow identities, because the categorization and reconciliation decisions written onto a bill originate in Ledger.
- **AC-KIT-012.31:** The grant table shall record a normal grant of `updateBillPayment` to Ledger consumer workflow identities, because the payment-to-bill links those writes record originate in Ledger's reconciliation.
- **AC-KIT-012.32:** The grant table shall record a normal grant of `updatePurchase` to Ledger consumer workflow identities, because the expense categorization those writes record originates in Ledger.
- **AC-KIT-012.28:** The grant table shall permit a write method declared in the exposed write set to carry no grant of either kind, because a change no system originates has no writer — `createJournalEntry` and `updateJournalEntry` are the cases that exist today.
- **AC-KIT-012.19:** The package shall expose the break-glass write path from an entry point other than the entry point exposing the normal write path.
- **AC-KIT-012.20:** The package's default entry point shall not export the break-glass write path.
- **AC-KIT-012.21:** The break-glass write path shall take a break-glass reason as a required argument.
- **AC-KIT-012.22:** When the break-glass reason is absent or empty, the break-glass write path shall refuse.
- **AC-KIT-012.27:** No module inside the package shall invoke the break-glass write path, so that no refusal on the normal path falls back to it.
- **AC-KIT-012.23:** The package shall write the consumer workflow identity that performed a create into the created entity, in a field QuickBooks returns on a read.
- **AC-KIT-012.24:** The package shall write the grant kind used for a create into the field named in AC-KIT-012.23.
- **AC-KIT-012.25:** When a create used a break-glass grant, the package shall write the break-glass reason into the field named in AC-KIT-012.23.
- **AC-KIT-012.26:** When the post-write re-read required by AC-KIT-008.11 returns a bill carrying no consumer workflow identity in the field named in AC-KIT-012.23, the package shall report the write as not verified.
- **AC-KIT-012.30:** The package shall not modify the field named in AC-KIT-012.23 on a non-create write, because doing so would overwrite the stamp the creating system wrote.
- **AC-KIT-012.8:** The package shall assert the capability gate of AC-KIT-008.1 and AC-KIT-008.43 on every write method it exposes.
- **AC-KIT-012.9:** The package shall ship a test that invokes each exported write path with a capability token that does not grant that path's write method, and fails unless every invocation refuses.
- **AC-KIT-012.10:** The set of write methods the package exposes shall be declared as data that the grant table's values are drawn from, so that a write method absent from that declaration cannot be granted.
- **AC-KIT-012.6:** When a write method is added to a consumer workflow identity's grant set, the test required by AC-KIT-012.4 shall pass without modification, provided AC-KIT-012.3, AC-KIT-012.16, and AC-KIT-012.18 continue to hold.
- **AC-KIT-012.13:** The package shall express the check required by AC-KIT-012.4 as a function over a grant table supplied to it.
- **AC-KIT-012.14:** The package shall ship a test that applies the function of AC-KIT-012.13 to a grant table granting a write method absent from the shipped grant table to identities of one consumer system, and that test shall assert the function reports no violation.
- **AC-KIT-012.15:** The package shall ship a test that applies the function of AC-KIT-012.13 to a grant table normal-granting one write method to identities of two consumer systems, and that test shall assert the function reports a violation.
- **AC-KIT-012.11:** When the grant table gains a write method for any consumer workflow identity, the release shall increment the gate-contract version required by AC-KIT-011.14.
- **AC-KIT-012.12:** A consumer shall not widen its own grants, because the package builds every token from the grant table per AC-KIT-008.2.

> **`AC-KIT-012.29`, `.31` and `.32` are load-bearing, not bookkeeping.** The widening turns an
> empty grant set from "may create nothing" into "may write nothing". Without these three grants,
> `reconcile` (`reconcile.ts:972`) and `expense-review` (`apply-review.ts:56`) — the two workflows
> `AC-KIT-008.35` exists to protect — would be **refused every write** the day Ledger adopts the
> package. Ship the table with Ledger's identities holding these three methods, not `[]`.
>
> **Operator decision D2 is intact under the widening, and it was checked rather than asserted.**
> Adding `createItem` to a new Cargo identity later adds a write method no other system holds, so
> `.12.3`, `.12.16` and `.12.18` all still hold, `.12.4`'s test passes unmodified, and `.12.14`'s
> fixture — which must name a method **absent from the shipped table** — is unaffected because it
> was never `createBill`-specific. Nothing in this re-sync names Cargo's permissible methods.

## Blueprints

`@blueprint:paver-qb-guarded-quickbooks-client` (**Revision 4**) — **ADR-013** (membership in the
grant set is the entire authorization decision; `#GrantSetMembershipGate` holds it and neither
`#BillCreationGateChain` nor `#GuardedWriteDispatcher` branches on method kind; no `CreateMethod`
type in the public vocabulary), **ADR-014** (the self-hosted REST adapter and `rest-client.ts` cross
into the package; `#HostedAdapter` and the MCP stdio connector stay in Ledger and are injected),
ADR-001 (custody protocol — its `generation`/`rotated_at` **recovery claim is withdrawn**; the
committed exchange-intent row replaces it, and the table is `WO-CARGO-020`'s migration `0026`),
ADR-002 (one Intuit application, one lineage, one shared store), ADR-003 (grant table keyed on
`ConsumerWorkflow`, now carrying grant kind), ADR-004 (the package builds the plan from the payload
it dispatches), ADR-005 (content-derived idempotency marker, non-nullable `docNumber`, composition
with the stamp), ADR-006 (freshness re-check is the package's obligation, not a driver grade),
ADR-007 (per-line `ClassRef` is the fifth gate; no gate opt-out), ADR-008
(`GATE_CONTRACT_VERSION`), **ADR-009** (`contract.ts` crosses whole; the package exports the guarded
contract, not the raw one), **ADR-011** (break-glass is a second grant kind on a separate entry
point, and every create is stamped), **ADR-012** (the partition is a function over a supplied grant
table).
`@blueprint:cargo-container-blueprint` (**Revision 5**, at
`brands/madson-co/.paver/blueprints/container/cargo-container-blueprint.md` — Brand level, singular
`container`; there is no `projects/cargo/.paver/blueprints/` directory and any citation using that
path is wrong) — ADR-018 (the partition, now stated over **write methods**; both grants exist from
`qb-v1.0.0`; no atomic move; presence of a token is not the check, membership is), ADR-023 (the
posting budget this package's timeouts and README request count feed).
`@blueprint:quickbooks-connector` (**Revision 4**) — ADR-006, ADR-007 (what leaves Ledger, and what
`src/qb/contract.ts` becomes), **ADR-008** (`#HostedAdapter` and the MCP stdio connector stay in
Ledger and are injected; `#CreationPolicy` is renamed `#WriteGrantPolicy` and the file it was named
for is deleted).
`@blueprint:paver-os-kit-platform` — build and release container.

## Acceptance criteria added by this Work Order

Each closes a defect the reviews found in the artifacts above. They are conditions of `done`,
not suggestions.

1. **The consumer identity is not forgeable.** No public entry point takes a consumer workflow
   identity as an argument; the package exports one function per consumer that closes over its own.
   A test proves there is no exported path by which a Ledger caller obtains a `cargo-factory-bill`
   token. *(Without this the partition is enforced on method names only, and Ledger passing Cargo's
   identity would be granted, not refused — `vendor-bill.ts:1052` takes it as an argument today.)*
2. **~~`AC-KIT-012.3` is implemented as "exactly one"~~ — WITHDRAWN, 2026-08-14 (Foreman F1).**
   This added AC argued the criterion was implementable as "exactly one consumer system" because
   `createJournalEntry` was "on Ledger's contract, not on the package's exposed create set". The
   same Work Order's In Scope table moves `contract.ts` across, and `contract.ts:312` declares
   `createJournalEntry` with `:334` listing it in `CONTRACT_METHODS` — so the premise was false.
   `@blueprint:paver-qb-guarded-quickbooks-client` **ADR-009** rules the contract crosses **whole**,
   `AC-KIT-012.28` makes an ungranted-but-declared method explicitly legal, and `AC-KIT-012.3` is
   now "no more than one" for a **normal** grant. Implement the AC as Revision 3 writes it. The
   number is retained rather than reused so the withdrawal is readable where the claim was made.
3. **Spec-first gate on the idempotency marker (hard pause).** Before implementing
   `AC-KIT-008.28`–`.30`, confirm **against the Intuit API reference** that a Bill's `PrivateNote` is
   filterable and record the citation in the scratch dir. If it is not, **stop and surface** — do not
   ship `.28`–`.30` as a comment or a no-op. The marker is still written as readable provenance; the
   probe falls back to vendor + document number, and a query error is never treated as an absence.
   *(No document in this chain cites an API reference. CLAUDE.md's spec-first rule forbids
   specifying against an unconfirmed API shape. `@REQ-KIT-008` Open Question 3.)*
4. **The marker is exactly matchable, and the stamp shares its field.** `AC-KIT-012.23`–`.25` put the
   consumer identity, the grant kind and the break-glass reason into the same QuickBooks field the
   marker occupies, and ADR-016 records existing FX/PO metadata there. `AC-KIT-008.40` is the
   criterion: the marker leads, the delimiter is stable, and the probe's filter matches it exactly.
   An `=` filter against a composite string never matches, and `LIKE` support is unsourced (added
   AC 3). Prove the probe or the marker gate does not ship.
5. **`AC-KIT-008.31` gets a channel to be true on.** The search contract returns a truncation signal
   (Ledger's reads return bare `Bill[]` — `contract.ts:286` — with no way for a caller to learn the
   set was truncated). The stub adapter can express truncation. In addition, both probes page to
   exhaustion (`fetchAll: true`, the behaviour at `vendor-bill.ts:686-694`) and a test asserts it.
6. **`AC-KIT-008.22` is checkable.** The public API's options are declared as data and a test
   enumerates them, asserting none names a gate. `recheckDuplicate` (`vendor-bill.ts:1005,1065`)
   does **not** cross the boundary; the removal is recorded in the release notes.
7. **`AC-KIT-008.12` is tested against disagreement.** The stub adapter's create response
   deliberately disagrees with its fetch; the test asserts the reported figures match the **fetch**.
   Without the disagreement the test passes for the wrong reason.
8. **`AC-KIT-010.4` walks the built graph.** Not a source grep. A re-export must not slip a filesystem
   import past it. It walks **every** public entry point — default, plan/hash, and break-glass —
   and `WO-KIT-002` adds `@paver/qb/postgres` to that list.
9. **The conformance suite carries a stale-snapshot criterion.** It fails a driver whose locked
   operation reads a snapshot taken before the previous holder committed — i.e. a driver running
   `REPEATABLE READ` or `SERIALIZABLE` passes mutual exclusion and still double-exchanges. The suite
   documents `READ COMMITTED` as a required property of the driver's transaction.
   *(kit ADR-001 discusses isolation only to reject `SERIALIZABLE` on a different ground, which
   reads as "stronger isolation is unnecessary" rather than "stronger isolation reintroduces the
   bug". Still routed to Boris; not a blocker, because the criterion is shippable either way.)*
10. **The release is a single tag, and both grants ship in it.** `GATE_CONTRACT_VERSION` starts at 1.
    The grant table ships with `cargo-factory-bill → createBill` **normal** and
    `ledger-vendor-bill → createBill` **break-glass** from `qb-v1.0.0`, so **no later release moves a
    grant** and there is no window either consumer has to be sequenced around
    (`@blueprint:cargo-container-blueprint` ADR-018, sequence table). The ordering that still matters
    is a Work Order dependency, not a release property, and it lives in `blocked-by`.
11. **`AC-KIT-012.14`'s fixture uses a **write** method the shipped table does not carry, and a
    comment says why.** The moment `createItem` is really granted, the fixture must move to another
    absent method or the test silently stops proving anything (ADR-012, "How we would know this is
    wrong"). Under Revision 4 the fixture's method may be a create or a non-create — the checker is
    a function over write methods and must not special-case either.
13. **There is no `CreateMethod` type in the public vocabulary.** `WriteMethod` is the type; creates
    are a subset of its values (kit ADR-013). A test enumerates the exported type names and fails on
    any that partitions the write surface by method kind. *(This is the structural half of
    `AC-KIT-008.44`. Behaviour can be made correct with two branches; the second branch is how the
    hole came back the first time, at `creation-policy.ts:80-85`.)*
12. **The README states the sequential request count as a number, not a description.** `AC-KIT-010.18`
    is what Cargo's `maxDuration` budget is arithmetic against — ADR-023 sizes 120s against a stated
    maximum of five sequential outbound requests. If the real number is not five, ADR-023's budget is
    wrong and must be re-cut before `WO-CARGO-023`.

## E2E Acceptance Tests

| COV | Covers |
|---|---|
| `COV_KIT_001` | AC-KIT-008.19 gate order + AC-KIT-008.6, .1, .3, .4, .5, .7, .8 — each gate refuses in isolation, and no QuickBooks request is issued before the duplicate probes |
| `COV_KIT_002` | AC-KIT-008.2 + AC-KIT-012.12 — a caller-supplied grant set is refused; added AC 1 — no exported path yields another consumer's identity |
| `COV_KIT_003` | AC-KIT-008.20, .21 — adapter without per-line class refuses; capability declaration with no measurement date refuses |
| `COV_KIT_004` | AC-KIT-008.22 + added AC 6 — enumerated public options, none disables a gate; `recheckDuplicate` absent from the surface |
| `COV_KIT_005` | AC-KIT-008.23, .24, .25 — the plan's single proposed value **is** the dispatched object (identity, not equality); approved total and line count read from it |
| `COV_KIT_006` | AC-KIT-008.9, .10, .26 — vendor+docNumber probe; refusal names the existing bill; null document number refuses |
| `COV_KIT_007` | AC-KIT-008.27, .28, .29, .30, .40 + added ACs 3, 4 — marker derived from plan content, written, probed, refused by name; exact-match proven with the provenance stamp sharing the field |
| `COV_KIT_008` | AC-KIT-008.31 + added AC 5 — truncated result set refuses; probes page to exhaustion |
| `COV_KIT_009` | AC-KIT-008.11, .12, .13, .14, .32, .15 + added AC 7 — stub whose create response disagrees with its fetch; reported figures come from the fetch; vendor, total (0.005) and line count each named on mismatch |
| `COV_KIT_010` | AC-KIT-008.16, .17, .18 — not-verified returns rather than throws; failed fetch still returns the identifier |
| `COV_KIT_011` | AC-KIT-008.33, .34, AC-KIT-010.19 — lost response and create timeout each report existence unknown, not failure, and return the marker |
| `COV_KIT_012` | AC-KIT-009.1, .2, .15 — interface shape; a stub driver satisfies it; cross-tenant read refused |
| `COV_KIT_013` | AC-KIT-009.3, .17, .18, .22 — two sequential locked operations against one expired stub record perform **exactly one** exchange; a fresh record takes **no lock at all** |
| `COV_KIT_014` | AC-KIT-009.8, .9, .19, .10 — persist-before-return; persist failure withholds the token and raises `ReauthorizationRequired`; expired refresh refuses without exchanging, same named error |
| `COV_KIT_015` | AC-KIT-009.4, .5, .6, .7, .20, .21, .28 + added AC 9 — the suite spawns real OS processes; fails simultaneous holders, read-before-write interleaving, cross-tenant return, a stale-snapshot driver, and a lock still held after its holder exits; passes a driver that exchanges twice for package reasons |
| `COV_KIT_016` | AC-KIT-009.11, .12, .13 — pure cipher; secret under 32 chars refuses; bad tag refuses indistinguishably |
| `COV_KIT_017` | AC-KIT-009.16, AC-KIT-010.16, .18 + added AC 12 — README names the keys, the Node-runtime constraint and the sequential request **count**; no file in the package holds a secret value |
| `COV_KIT_018` | AC-KIT-010.1, .2, .3, .4, .5, .6, .7 + added AC 8 — built-graph walk from every public entry point; the plan/hash entry point is filesystem-free; no file driver, no subprocess adapter exported |
| `COV_KIT_019` | AC-KIT-010.8, .15 — no config file read, no environment variable read at runtime |
| `COV_KIT_020` | AC-KIT-010.9, .10, .11, .17 + AC-KIT-009.32, .33 — mapping, transport, credentials and a timeout on every outbound request arrive as arguments; the **realm does not** — it is read from the record fetched under the request's tenant key, and no exported signature accepts a realm beside a tenant key. Proven with a store holding two records whose realms differ: a request under tenant key A reaches realm A, and there is no argument by which a caller can send it to realm B |
| `COV_KIT_021` | AC-KIT-010.12, .13, .14 — no `@paver/*` dependency; installs from a pinned git tag; imports from a Node script and from a Node-runtime route handler, with declarations |
| `COV_KIT_022` | AC-KIT-011.14, AC-KIT-011.22, AC-KIT-012.11 + added AC 10 — the constant is exported and starts at 1; a grant-table change without a bump fails; the release note names every pinned consumer |
| `COV_KIT_023` | AC-KIT-012.1, .2, .17, .3, .16, .18, .4, .5, .7, .28, .10, **.29, .31, .32** — the partition over the shipped table, stated over **write** methods: `createBill` normal to Cargo and break-glass to Ledger; `updateBill`, `updateBillPayment` and `updatePurchase` **normal to Ledger**; no system holding both kinds of one method; `createJournalEntry` and `updateJournalEntry` declared and granted to nobody without violation |
| `COV_KIT_024` | AC-KIT-012.8, .9 + AC-KIT-008.43, .44 — every exported **write** path refuses an ungranted token, creates and non-creates alike. The controlling case: a token whose grant set is exactly `['createBill']` is **refused** `updateBill`, `updateBillPayment` and `updatePurchase`. A test that only exercises creates passes against the defect this Work Order exists to remove |
| `COV_KIT_036` | AC-KIT-010.20 — no exported adapter can omit a per-line class reference. The self-hosted REST adapter is the only one exported (`rest-client.ts`, `self-hosted.ts`); `hosted.ts` and `mcp-stdio-client.ts` are absent from the built graph of every public entry point. This is the export-time control that `AC-KIT-008.20`'s runtime refusal is no longer alone in providing (`@REQ-KIT-008` Closed Question 6, measured at `ledger/config/tenants/madson/tenant.json:14`) |
| `COV_KIT_037` | AC-KIT-010.21, .22, .23, .24, .25 — the built graph of the public entry points contains **exactly one** module that sends a request to QuickBooks, it is reachable from a public entry point, and every request it sends goes through the injected transport (a recording transport sees all of them; a network call made any other way fails the test). A caller-supplied adapter is accepted for a method group and is dispatched through the guarded contract, not around it. This is the export-side pair to `COV_KIT_036`: `.36` proves no *wrong* adapter is exported, `.37` proves the *right* one is |
| `COV_KIT_038` | **AC-KIT-010.26, .27** — the exported adapter's capability declaration carries a **measurement date** for per-line class support, and the date is a real one rather than a placeholder. The controlling assertion is the negative: an enumeration of the package's public surface finds **no** exemption, flag, constant or by-construction branch by which a create proceeds against a declaration with no measurement date. `PER_LINE_CLASSREF_BY_CONSTRUCTION` (`vendor-bill.ts:630-658`) is Ledger's escape from `AC-KIT-008.21`; a test that only checks the happy path passes against a package that ported it across. Measured today, `self-hosted.ts:316` declares `measuredAt: null` — so this test **fails against the code as it stands**, which is the point |
| `COV_KIT_039` | **AC-KIT-010.28, .29, .30, .31, .32, .33, .34, .35, .36** — the exported reference read resolves an account, a class, an item and a vendor **by identifier** and returns the name QuickBooks holds; it accepts no name as the value it resolves; an identifier resolving to nothing is reported as such, and a **failed** read is reported as something else entirely (the `AC-KIT-008.31` rule, one entity over — a stub that throws and a stub that returns empty must produce distinguishable results, and a test that only stubs empty passes against code that catches everything and calls it "not found"); a recording transport proves every read goes through the **same adapter surface** a write does; no capability token is required; and the token comes from the `@REQ-KIT-009` custody path with **no second credential path** in the built graph |
| `COV_KIT_025` | AC-KIT-012.13, .14, .15, .6 + added AC 11 — the checker is a function over a **supplied** table: a fixture granting a method **absent from the shipped table** to one system reports no violation; a fixture normal-granting one method to two systems reports one; growing a grant set leaves `COV_KIT_023` passing unmodified |
| `COV_KIT_026` | AC-KIT-012.19, .20, .21, .22, .27 — the break-glass path is not on the default entry point, refuses an absent or empty reason, and is imported by no module inside the package (built-graph assertion, not a source grep) |
| `COV_KIT_027` | AC-KIT-012.23, .24, .25, .26, **.30** — identity and grant kind stamped on every create, reason on a break-glass create; a stub whose fetch strips the stamp reports **not verified**; and a **non-create** write dispatched over a bill that already carries a stamp leaves that field byte-identical, so Ledger's categorization cannot erase the record of who created the bill |
| `COV_KIT_028` | AC-KIT-008.35, .36, .37, **.43, .44**, .38, .39, .41, .42 — the guarded contract dispatches a non-create write behind a token, re-reads it, derives verification only from the re-read; no exported symbol dispatches a write without a token; `presentPlan` is exported. **The authorization assertion is structural, not behavioural**: a test proves the dispatcher reaches its refusal through one membership test with no branch on method kind (`#GrantSetMembershipGate`, kit ADR-013), because a behavioural test of creates and a behavioural test of updates both pass against a two-branch implementation that gets one branch wrong |
| `COV_KIT_029` | AC-KIT-009.23, .24, .25, .26, .27 — the exchange is timed out; a timeout writes no record and refuses; a recording stub driver proves no other outbound request is made while the lock is open |
| `COV_KIT_030` | AC-KIT-009.29 — the suite takes its connection route as an injected value and refuses to grade a driver over a stub |

## Verification

| Signal | Command | Pass condition |
|---|---|---|
| Types | `npx tsc --noEmit` | exits 0 |
| Build | `npm run build` (kit) | exits 0, emits ESM + `.d.ts` for every public entry point |
| Tests | package test runner | green **and tests-run matches test-files-on-disk** — a glob that silently skips a file still prints `fail 0` ([[verify-test-count-not-just-green]]) |
| Serverless surface | `COV_KIT_018` | built graph reaches no `node:fs`, `node:path`, `node:child_process` |
| Cross-process lock | `COV_KIT_015` | spawns real OS processes; the five failing-driver criteria each fail a deliberately broken driver |
| Partition extensibility | `COV_KIT_025` | the absent-method fixture reports no violation — a checker hard-coded to `createBill` fails here |
| Install | `npm i github:paver-os/kit#qb-v1.0.0` in a scratch dir | exits 0, no registry token (AC-KIT-002.3) |
| Marker spec | scratch `context.md` | carries the Intuit API reference citation for `PrivateNote` filterability, or the recorded refusal |

**No live QuickBooks write is performed under this Work Order.** Every adapter test runs against the
stub. Creating a real payable is a hard gate and belongs to `WO-CARGO-023`.

## Blockers on `open/` → `in-progress/`

Revision 1's three blockers closed in Revision 2. Revision 3 closed a fourth. Revision 4 declared a
fifth and **Revision 5 closes it.** **`blocked-by` is empty and this Work Order is at the root of the
graph — nothing else can start until it does. The one remaining entry in `open-blockers` does not
gate the transition; it is a declared hard pause inside the build, recorded in frontmatter so it is
not discovered late.**

| Blocker | Status |
|---|---|
| ADR-003 revised, stale break-glass sentences corrected | **CLOSED** — Blueprint Revision 2 |
| `AC-KIT-011.15` re-cut to the break-glass path | **CLOSED** — Requirement Revision 3 |
| `operator-decision-attribution-OQ2` | **CLOSED — operator decision D4, 2026-08-14.** Advisory provenance accepted; **one** Intuit application; two-application attribution **rejected**. Recorded at `@REQ-KIT-008` Closed Question 4. Removed from frontmatter |
| `boris-adapter-imports-R13` | **CLOSED 2026-08-14 — `@blueprint:paver-qb-guarded-quickbooks-client` ADR-016**, with `@blueprint:quickbooks-connector` **ADR-008** amended to match. The interface, the capability-declaration symbols and the method-group dispatch cross; the routing map, the measurement and `#HostedAdapter` stay. `#AdapterRouter` is reduced to configuration, not deleted. **No Acceptance Criterion was needed** — `AC-KIT-010.25` already obliges the package to own the interface, exactly as `@REQ-KIT-008` Revision 5 predicted. Removed from frontmatter. Verified by reading ADR-016, not by relaying a report |
| `spec-first-privatenote-OQ3` | **STANDS** — see below. The only entry left |
| `adapter-declaration-undated` | **NOT DECLARED AS A BLOCKER, deliberately — it is now a criterion.** See the note below |

**What D4 changes inside this build, and it is not only documentation.** One Intuit application means
one rotating refresh token, and **both products share it**. The cross-process lock of `@REQ-KIT-009`
is therefore a **cross-PRODUCT** lock: it must hold between Cargo's N serverless instances *and*
Ledger's local CLI, which can run `ledger auth` from a laptop while a Cargo post is in flight. No AC
is re-cut for this — `AC-KIT-009.5` already grades contention across separate operating-system
processes without naming a product, which is why it was written that way — but the conformance suite
built here must not acquire a Cargo-shaped assumption about who its two processes belong to. The
obligation to actually *run* the grading on each deployed driver is `AC-KIT-011.30` and `.31`,
claimed by `WO-CARGO-020` and `WO-026`.

**The one blocker that remains — `spec-first-privatenote-OQ3`, unchanged.** The marker's
filterability is unsourced (added AC 3). It does **not** block the transition to `in-progress/`; it
is a **hard pause inside the build**, at the point `AC-KIT-008.29` is implemented. It stays in
frontmatter so it cannot be discovered late. What must be read to clear it: an **Intuit Accounting
API reference for the Bill entity's query surface**, showing whether `PrivateNote` is a filterable
field and, if so, which operators it supports — an `=` filter against a composite string never
matches, so `LIKE` or a substring operator is what added AC 4 needs. Record the citation in the
scratch dir. If no returned field is filterable, `AC-KIT-008.29`/`.30`/`.40` are unverifiable and
must be re-cut against what the API does support — **not shipped as a comment or a no-op**.
`WO-CARGO-023` added AC 6 already specifies the survivable fallback on the consumer side: duplicate
detection falls back to vendor + document number **plus the attempt claim**, neither of which depends
on `PrivateNote` filterability. So the chain does not stall on this answer; only these three ACs do.

**`boris-adapter-imports-R13` is closed and this is what landed.** Revision 4 named three shapes
Boris could choose between. He chose the first, in **ADR-016**: the two symbols cross with the
adapter — specifically the `Adapter` **interface**, `AdapterCapabilities`, `AdapterName`,
`declareCapabilities`, `unsupportedMethods`, `CapabilityUnavailable` and the method-group
**dispatch**. What stays in Ledger is the routing **map**, `#CapabilityDiffer`'s **measurement** and
`#HostedAdapter`; `#AdapterRouter` is reduced to configuration rather than deleted, so Ledger keeps
its routing choice through `AC-KIT-010.25`. Cargo supplies no map and every method group defaults to
the exported adapter. The builder's forbidden shortcut is unchanged in spirit and now has an ADR
behind it: **do not move the routing map or the differ across** to make an import resolve.

**The one blocker that is genuinely new information, and it is NOT a frontmatter blocker —
`adapter-declaration-undated`.** Boris measured it while closing R13: `self-hosted.ts:316` declares
`measuredAt: null`, and `AC-KIT-008.21` refuses a create whose receiving adapter's capability
declaration carries no measurement date. **As measured today, the only adapter this package may
export refuses every create** — the same failure shape as ITEM A, on the kit side.

| Property | Status |
|---|---|
| Blocks `open/` → `in-progress/` | **No** |
| Is it a hard pause inside the build | **No, and this is the distinction.** `spec-first-privatenote-OQ3` waits on an Intuit reference nobody in this chain has read. This one waits on a **measurement the builder performs**: does the self-hosted REST adapter accept a `ClassRef` on every bill line, and on what date was that established. That is work, not an unsourced question, so it belongs in the criteria and not in `open-blockers` |
| Where it now lives | `AC-KIT-010.26` (the declaration carries the date) and `AC-KIT-010.27` (the package holds no exemption from `AC-KIT-008.21`), claimed above and asserted by `COV_KIT_038` |
| What the builder must **not** do | Port `PER_LINE_CLASSREF_BY_CONSTRUCTION` (`vendor-bill.ts:630-658`) across with the gate. Ledger holds that exemption and escapes `AC-KIT-008.21` through it; `AC-KIT-010.27` forbids the package acquiring one. Also: do not ship `measuredAt: null` with a comment promising to fill it in — `COV_KIT_038` fails on it |
| Fails silently | **No.** `AC-KIT-008.21` refuses at runtime and `COV_KIT_038` refuses at build. The risk was never that it ships wrong; it was that it ships *dead*, refusing every create, and nobody traced why |

**Not a blocker, and downgraded from prerequisite:** the credentials inline in
`unicorn-ceo/.mcp.json`. Measured 2026-08-14 — that file and Ledger use **different Intuit
applications against the same production realm**, so rotating it does **not** invalidate Ledger's
token and does not gate the first Cargo write. It remains a real exposure, because it writes to the
real books: a **tracked risk with an owner (Tony Davis)**, not a gate. Key names only; no value read
or reproduced. No live call is made under this Work Order in any case.

## Notes

- ~~Ledger keeps its own `creation-policy` for the eleven non-create workflow names.~~ **Superseded,
  Revision 2.** `AC-KIT-011.2` deletes `creation-policy.ts` **and** `guarded.ts` from Ledger, so the
  eleven names cannot stay there. They become consumer workflow identities in **this package's**
  table (ADR-003, ADR-009, `AC-KIT-011.23`–`.25`). Thirteen identities ship in one table: one Cargo
  and twelve Ledger.
- ~~The eleven Ledger identities arrive with **empty** create-grant sets — the same structure
  `creation-policy.ts:41-54` already uses.~~ **Superseded, Revision 3.** That idiom *was* the defect.
  It expressed "may update, may create nothing" only because the process boundary was the
  authorization boundary inside one trusted local CLI; the moment a second product's serverless
  identity entered the table, "may update" spanned a product boundary and nothing checked it. Under
  `AC-KIT-008.44` an empty grant set now refuses **every** write, so shipping the eleven identities
  with `[]` would break `reconcile` and `expense-review` on adoption day. They ship holding
  `updateBill`, `updateBillPayment` and `updatePurchase` (`AC-KIT-012.29`, `.31`, `.32`). Of the
  thirteen identities, `cargo-factory-bill` holds `createBill` **normal**, `ledger-vendor-bill` holds
  `createBill` **break-glass**, and the eleven hold the three update methods.
- `encryptRecord` / `decryptRecord` move **verbatim**, salt included
  (`scryptSync(secret, 'ledger.quickbooks.tokenstore.v1', 32)`). Changing the salt makes every
  existing ciphertext unreadable for no gain.
- `src/qb/contract.ts` crosses **whole** — this was the builder's first question and four documents
  answered it four ways. The single ruling is ADR-009; do not re-derive it.
- Known risk, recorded not acted on: `unicorn-ceo/.mcp.json` is git-tracked and holds the QuickBooks
  client identifier, client secret, refresh token and realm identifier as inline literal values (key
  names only; no value read or reproduced). **Whether that application is this lineage's is no longer
  unsourced — it was measured on 2026-08-14: it is a DIFFERENT Intuit application against the SAME
  production realm.** Consequence, and it points both ways: rotating it does not invalidate Ledger's
  token, so it is not a prerequisite to anything in this chain; but it writes to the real books, so
  it is a live exposure. Tracked risk, owner Tony Davis. Rotation is an operator-gated credential
  action — no Work Order and no agent performs it.
- `AC-KIT-011.22` is the one AC in this chain that does not reduce to a machine signal — its
  verification is "an entry exists in the drift log". Karl declares it as a defect and writes it with
  `should`, not `shall`. It is claimed here and is a **release-note obligation**, not a passing gate;
  do not attempt to fake a signal for it.
