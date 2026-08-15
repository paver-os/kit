# @paver/qb — Guarded QuickBooks Client — Component Blueprint

> **Type:** Component Blueprint
> **Paver Level:** OS (shared package in `paver-os/kit`; consumed by both roots, belongs to neither)
> **Traces up to:** `@REQ-KIT-008` · `@REQ-KIT-009` · `@REQ-KIT-010` · `@REQ-KIT-011` · `@REQ-KIT-012` (file: `kit/.paver/requirements/frds/REQ-KIT-008-paver-qb-guarded-quickbooks-client.md`, **Revision 5**)
> **Fulfils:** `AC-KIT-007.1` (the deferred-package Requirement that `@paver/qb` was owed)
> **Composed by:** `@blueprint:paver-os-kit-platform` (build/release container) · `@blueprint:cargo-container-blueprint` (consumer) · `@blueprint:quickbooks-connector` (consumer)
> **Status:** Draft
> **Owner:** Boris Frank (Architect)
> **Last reviewed by Boris:** 2026-08-14 — **Revision 4. The read surface, and what crosses with the adapter.** Re-synced to `@REQ-KIT-008` Revision 5. Three decisions added. **ADR-015**: the package exports a guarded **reference read** — resolve an account, class, item or vendor by its QuickBooks identifier and return the name QuickBooks holds for it. Without it `AC-CARGO-018.48` (read the identifier from QuickBooks before saving a mapping) and `AC-KIT-011.42` (no Cargo file constructs an Accounting API request) contradict each other and `#QbReferenceVerifier` cannot do its job by any permitted path. **ADR-016** closes **R13**: the adapter interface, the capability-declaration helper and the method-group dispatch cross with `#SelfHostedAdapter`; the routing **map**, the capability **measurement** and `#HostedAdapter` stay in Ledger. **ADR-014 gains a clause**: the adapter the package exports must carry a capability declaration with a measurement **date** — `self-hosted.ts:316` declares `measuredAt: null`, and `AC-KIT-008.21` refuses a declaration with no measurement date, so as measured today the only exportable adapter refuses every create.
> **Revision 3** — 2026-08-14. **The authorization widening.** Re-synced to `@REQ-KIT-008` Revision 4. Authorization is one membership test over the token's grant set, applied to every write method with no branch on method kind — new **ADR-013**, and `#GrantSetMembershipGate` is the node that holds it. The partition is re-stated over **write methods** throughout (ADR-003, ADR-011, ADR-012). **ADR-001's recovery claim is withdrawn and replaced**: `generation` and `rotated_at` cannot distinguish a lost exchange from no exchange, because both are written inside the transaction that rolls back; the committed exchange-intent row is the mechanism that can. **ADR-014** is new — the self-hosted REST adapter crosses into the package and the hosted and subprocess adapters cannot, by measurement. ADR-002 folds in operator decision D4 (advisory provenance, one Intuit application, **the token lock is cross-product**) and withdraws its credential-rotation prerequisite.
> **Revision 2** — 2026-08-14. The backwards reconciliation. Re-synced to `@REQ-KIT-008` Revision 3. Four decisions added: ADR-009 (`contract.ts` crosses whole; the package exports the guarded contract, not raw methods), ADR-010 (the shared Postgres custody driver ships from this package, over one production connection route), ADR-011 (break-glass is a second grant kind on a separate entry point, and every create is stamped), ADR-012 (the partition check is a function over a supplied table, so adding an entity is a data change).

## Capability Summary

`@paver/qb` is the only place in the fleet where a QuickBooks write may be dispatched. It exposes a guarded contract whose every write method requires a capability token (`AC-KIT-008.36`, `AC-KIT-008.39`), and it holds every gate that stands between an operator's approval and a write to the general ledger: the capability grant, the two approval hashes, the single-change constraint, the per-line `ClassRef` capability check, the two duplicate probes, and the post-write re-read that is the sole source of every reported figure.

The package exists because the same guarded path must now run in two processes — Cargo's Vercel route handler and Ledger's local CLI — and a copied gate is a gate that gets fixed in one place. Extraction, not duplication, is the whole point (`@REQ-KIT-008` Overview).

The package also owns the **partition**: one grant table maps each consumer workflow identity to the **write** methods it may call and the **kind** of each grant, so each write method has at most one normal writer and any second writer is declared break-glass rather than incidental (`@REQ-KIT-012`). The partition is a property of data the package holds, checked by a function over that data (ADR-012), which is what lets Cargo's next entity be a table edit rather than a re-architecture.

Authorization asks exactly one question, of every write method alike: is this method in the token's grant set (`AC-KIT-008.44`)? A create and an update are entries in the same set and the check does not branch on which it is looking at (ADR-013). Revision 2 of this Blueprint described a capability gate that refused ungranted **creates** and said nothing about updates, which is how a token granting exactly `createBill` reached `updateBill` unrefused; `#GrantSetMembershipGate` is the node that now holds the single test.

The package is also the only place in the fleet where a QuickBooks Accounting API **request** is constructed, for reads as well as writes. It exports one adapter (`AC-KIT-010.21`, `AC-KIT-010.22`), and it exports a reference read — resolve an account, class, item or vendor by identifier, return the name QuickBooks holds — because a consumer that must verify a mapping identifier against the live chart has no other permitted way to do it (`AC-KIT-011.39`, `AC-KIT-011.42`, ADR-015). Reads carry no capability token; a read changes nothing.

The package is feature-agnostic and tenant-agnostic. It takes vendor, account and class mapping as arguments (`AC-KIT-010.9`), its HTTP transport as an injected function (`AC-KIT-010.10`), its database handle as an injected queryable (ADR-010), and its client identifier and client secret as caller-supplied configuration (`AC-KIT-010.11`). The **realm is not among them** — it is read from the token record the tenant key addressed, so a write cannot address a company the token does not belong to (`AC-KIT-009.32`, `AC-KIT-009.33`). It reads no configuration file and no environment variable of its own (`AC-KIT-010.8`, `AC-KIT-010.15`).

## Core Components

### The guarded write path

```component
name: BillCreationGateChain
container: paver-os/kit (@paver/qb)
responsibilities:
  - Running the pre-write gates in a fixed order and sending no QuickBooks request until all have passed, except the duplicate probes (AC-KIT-008.19)
  - Refusing — raising an error that ends the call before any write request is sent — on any gate failure (Terminology, "Refuse")
  - Returning `GuardedBillResult` on every path where a create succeeded, verified or not (AC-KIT-008.16, AC-KIT-008.17, AC-KIT-008.18)
  - Reporting the bill's existence as UNKNOWN, and returning the idempotency marker, when the create request fails or times out before a response is received (AC-KIT-008.33, AC-KIT-008.34, AC-KIT-010.19)
```

```component
name: CapabilityGrantTable
container: paver-os/kit (@paver/qb)
responsibilities:
  - Holding the closed set of consumer workflow identities, the system each belongs to, and the WRITE methods each may call with the kind of each grant (AC-KIT-012.1, AC-KIT-012.2, AC-KIT-012.17)
  - Recording a create method and a non-create write in one grant set, drawn from one declared exposed WRITE set, so a method absent from that declaration cannot be granted (AC-KIT-012.10)
  - Building every `CapabilityToken` from that table and refusing a grant set supplied by a caller (AC-KIT-008.2, AC-KIT-012.12)
```

```component
name: GrantSetMembershipGate
container: paver-os/kit (@paver/qb)
responsibilities:
  - Deciding whether a capability token permits a write method by that method's membership in the token's grant set ALONE, with no branch on whether the method creates or updates (AC-KIT-008.44)
  - Refusing an ungranted create and an ungranted non-create write identically (AC-KIT-008.1, AC-KIT-008.37, AC-KIT-008.43)
  - Being the one authorization step both `#BillCreationGateChain` and `#GuardedWriteDispatcher` call, so every exported write method is gated by the same test (AC-KIT-012.8, AC-KIT-012.9)
```

```component
name: GrantPartitionChecker
container: paver-os/kit (@paver/qb)
responsibilities:
  - Reporting, for a grant table SUPPLIED to it, every WRITE method normal-granted to identities of more than one system, every write method break-glass-granted to identities of more than one system, and every system holding both kinds for one method (AC-KIT-012.13, AC-KIT-012.3, AC-KIT-012.16, AC-KIT-012.18)
  - Reporting no violation for a write method carrying no grant of either kind (AC-KIT-012.28)
```

```component
name: VendorBillPlanBuilder
container: paver-os/kit (@paver/qb)
responsibilities:
  - Constructing the `ChangePlan` whose single change carries the exact `CreateBillPayload` that will be dispatched (AC-KIT-008.23)
  - Computing `planHash` and `decisionHash` over that plan from an entry point whose import graph reaches no filesystem module (AC-KIT-010.5)
  - Deriving `PlanId` from the plan's content so a retry of the same approval produces the same identifier (AC-KIT-008.27)
  - Rendering a plan's proposed changes for operator review, because the plan's shape is the package's (AC-KIT-008.41)
```

```component
name: ApprovalHashAssertion
container: paver-os/kit (@paver/qb)
responsibilities:
  - Refusing a plan with no approval block (AC-KIT-008.3)
  - Recomputing `planHash` and `decisionHash` from the plan's changes and refusing on either mismatch (AC-KIT-008.4, AC-KIT-008.5)
  - Refusing a plan carrying any change other than the one bill, and refusing an item with no decision or a skip decision (AC-KIT-008.6, AC-KIT-008.7, AC-KIT-008.8)
```

```component
name: PerLineClassRefGate
container: paver-os/kit (@paver/qb)
responsibilities:
  - Refusing when the adapter that would receive the create does not accept a `ClassRef` on every bill line, or when its capability declaration carries no measurement date (AC-KIT-008.20, AC-KIT-008.21)
```

```component
name: DuplicateBillProbe
container: paver-os/kit (@paver/qb)
responsibilities:
  - Querying QuickBooks immediately before dispatch for a bill holding the same vendor identifier and the same document number (AC-KIT-008.9)
  - Querying for a bill carrying the same `PlanId` idempotency marker, so a create whose response was lost is found rather than repeated (AC-KIT-008.29)
  - Refusing and naming the existing bill when either query returns one (AC-KIT-008.10, AC-KIT-008.30)
  - Refusing rather than reporting an absence when either search returns a truncated result set (AC-KIT-008.31)
```

```component
name: BillProvenanceStamper
container: paver-os/kit (@paver/qb)
responsibilities:
  - Composing the one field QuickBooks returns on a read from the idempotency marker first and the provenance segment after it, so the marker stays exactly matchable beside the stamp (AC-KIT-008.28, AC-KIT-008.40)
  - Writing the consumer workflow identity and the grant kind used into that field on every create, and the break-glass reason when one applies (AC-KIT-012.23, AC-KIT-012.24, AC-KIT-012.25)
```

```component
name: PostWriteBillVerifier
container: paver-os/kit (@paver/qb)
responsibilities:
  - Fetching the created bill back by the identifier the create returned (AC-KIT-008.11)
  - Deriving the reported total and line count from that fetch and never from the create response (AC-KIT-008.12)
  - Reporting not-verified, naming field, approved value and fetched value, when the vendor differs, the total differs by 0.005 or more, or the line count differs (AC-KIT-008.13, AC-KIT-008.14, AC-KIT-008.15, AC-KIT-008.32)
  - Reporting not-verified when the fetched bill carries no consumer workflow identity in the stamped field (AC-KIT-012.26)
```

```component
name: BreakGlassBillCreator
container: paver-os/kit (@paver/qb — break-glass entry point only)
responsibilities:
  - Running the same `#BillCreationGateChain` against a token whose `createBill` grant is of kind break-glass (AC-KIT-012.7)
  - Taking the break-glass reason as a required argument and refusing when it is absent or empty (AC-KIT-012.21, AC-KIT-012.22)
  - Being exported from an entry point the default entry point does not re-export (AC-KIT-012.19, AC-KIT-012.20)
```

```component
name: GuardedWriteDispatcher
container: paver-os/kit (@paver/qb)
responsibilities:
  - Dispatching an approved change — a create, an update, a re-link, a re-categorization — to QuickBooks, requiring a capability token on every write method it exposes (AC-KIT-008.35, AC-KIT-008.36)
  - Authorizing every one of those methods through `#GrantSetMembershipGate` and holding no create/non-create branch of its own, so an ungranted `updateBill` refuses on the same test as an ungranted `createBill` (AC-KIT-008.37, AC-KIT-008.43, AC-KIT-008.44)
  - Leaving the provenance field untouched on a non-create write, so a later update cannot overwrite the stamp the creating system wrote (AC-KIT-012.30)
  - Re-reading every record it writes and deriving the verification result from that re-read and from no part of the write response (AC-KIT-008.38, AC-KIT-008.42)
```

`#BillCreationGateChain` calls `#ApprovalHashAssertion` before it constructs a `CapabilityToken` request against `#CapabilityGrantTable`, and calls neither until it has established that the plan carries exactly one `Bill` change; the ordering exists because a plan carrying two changes is not a vendor-bill plan at all, and asking whether a workflow may create a bill from it is the wrong question to answer first (`vendor-bill.ts:1035-1050` runs the shape check ahead of `tokenFor`/`assertMayCreate` at `:1055-1057`, and `AC-KIT-008.19` was re-cut in Revision 2 to that order).

`#VendorBillPlanBuilder` hands `#ApprovalHashAssertion` a plan whose single `proposedValue` **is** the `CreateBillPayload` that `#BillCreationGateChain` will dispatch, so the hashes the operator approved cover the bytes that reach QuickBooks. Building the plan anywhere else re-opens the hole ADR-004 closes: a consumer that re-derives lines after approval satisfies the hash check against a payload the operator never read.

`#BillCreationGateChain` and `#GuardedWriteDispatcher` both call `#GrantSetMembershipGate` and neither holds an authorization branch of its own, so the two entry points into QuickBooks cannot disagree about what a token permits. One test in one node is also what makes `AC-KIT-012.9`'s shipped test — invoke every exported write path with a token that does not grant its method, and fail unless every invocation refuses — a check over one behaviour rather than a sweep for a behaviour repeated per call site (ADR-013).

`#CapabilityGrantTable` hands `#GrantSetMembershipGate` a `CapabilityToken` whose `grants` map is built from the table and never from the caller, which is what keeps the membership test meaningful: a gate that asks one question is only as strong as the provenance of the set it asks about (`AC-KIT-008.2`, `AC-KIT-012.12`).

`#GrantPartitionChecker` reads a `GrantTable` value handed to it and returns violations; the package's own shipped test hands it the shipped table (`AC-KIT-012.4`) and two fixture tables (`AC-KIT-012.14`, `AC-KIT-012.15`). Taking the table as an argument rather than closing over the shipped one is what makes the extensibility falsifiable — a checker hard-coded to `createBill` passes the shipped table and fails the fixture carrying a write method the shipped table does not have (ADR-012).

`#DuplicateBillProbe` runs after every refusing gate and immediately before dispatch, and its two queries are the only QuickBooks requests `#BillCreationGateChain` permits before the create (`AC-KIT-008.19`). It reads through the same contract the create uses, so a truncated search cannot be mistaken for an absent bill — Ledger's `findExistingBill` already passes `fetchAll: true` for exactly that reason (`vendor-bill.ts:686-694`), and `AC-KIT-008.31` now requires the refusal.

`#BillProvenanceStamper` composes the field `#BillCreationGateChain` sends and `#DuplicateBillProbe` later queries, which is why the marker is written first and the provenance segment after it: the probe's match is on the marker, and a stamp appended ahead of it would break the one query the idempotency guarantee rests on (`AC-KIT-008.40`, ADR-005, ADR-011).

`#PostWriteBillVerifier` receives the approved `CreateBillPayload` and the created bill's identifier, never the create response body. It compares vendor identifier as well as total and line count, because an approval hash that binds the payload proves what was *sent* and a re-read is the only thing that proves what was *stored* — and the recorded Ledger 2026-08-12 defect was a plan editable to a different vendor **and** amount, of which only the amount is caught by a total comparison.

`#PostWriteBillVerifier` also reads the stamp back out of the fetched bill and reports not-verified when no consumer workflow identity is present, so a create that reached QuickBooks without provenance is surfaced rather than recorded as clean (`AC-KIT-012.26`). What that proves is bounded and stated at Known Risks: it proves the package read back what the package wrote, not that the stamp is trustworthy.

`#BreakGlassBillCreator` calls the same `#BillCreationGateChain` as the normal path and differs only in the token kind it accepts, the required reason it forwards to `#BillProvenanceStamper`, and the entry point it is reachable from. Nothing inside the package imports it (`AC-KIT-012.27`), so a refusal on the normal path can never fall back to it — a fallback would make the break-glass grant reachable without an operator deciding to reach for it.

`#GuardedWriteDispatcher` is what Ledger's `reconcile` (`reconcile.ts:972`) and `expense-review` (`apply-review.ts:56`) call after adoption, in place of the local `GuardedContract` that composes the three modules `AC-KIT-011.2` deletes (`guarded.ts:4-6`). It exists because extracting only the create path would leave two money-touching workflows recomputing an approval hash and verifying a write from a second copy — the drift this package exists to end, moved one file over (ADR-009).

`#GuardedWriteDispatcher` reaches those two workflows only because `#CapabilityGrantTable` names `updateBill`, `updateBillPayment` and `updatePurchase` in the Ledger identities' grant sets (`AC-KIT-012.29`, `AC-KIT-012.31`, `AC-KIT-012.32`). Revision 2 recorded those identities as holding **empty** grant sets, which was coherent only while the gate ignored non-creates; under `AC-KIT-008.44` an empty set refuses every write, so leaving them empty would have broken the two workflows the extraction exists to protect.

### The transport, and what it is declared to be able to do

```component
name: SelfHostedRestAdapter
container: paver-os/kit (@paver/qb)
responsibilities:
  - Constructing and sending every QuickBooks Accounting API request the guarded contract dispatches, through the transport injected per AC-KIT-010.10 (AC-KIT-010.21, AC-KIT-010.23)
  - Being the only adapter the package exports that sends a request to QuickBooks, and being reachable from a public entry point so the built-graph walk covers it (AC-KIT-010.22, AC-KIT-010.24)
  - Carrying a capability declaration that records a measurement DATE for per-line class support, because AC-KIT-008.21 refuses a declaration without one (ADR-014)
```

```component
name: AdapterGroupDispatcher
container: paver-os/kit (@paver/qb)
responsibilities:
  - Resolving a contract method to an adapter by the method's group, from a routing map the caller supplies (AC-KIT-010.25)
  - Defaulting every group to `#SelfHostedRestAdapter` when the caller supplies no map, so a consumer with one adapter makes no routing decision (ADR-016)
  - Raising `CapabilityUnavailable` rather than dispatching a method the resolved adapter declares unsupported, because an empty result is indistinguishable from an absent record
```

```component
name: ReferenceIdentifierReader
container: paver-os/kit (@paver/qb)
responsibilities:
  - Resolving a QuickBooks account, class, item or vendor BY ITS IDENTIFIER and returning the name QuickBooks holds for it, or reporting that the identifier resolved to nothing (ADR-015)
  - Dispatching that read through `#AdapterGroupDispatcher` and the same injected transport the write path uses, so no consumer constructs an Accounting API request of its own (AC-KIT-011.39, AC-KIT-011.42)
  - Requiring no capability token, because a read changes nothing (ADR-009)
  - Taking a caller-supplied timeout on the read, as every outbound request does (AC-KIT-010.17)
```

`#ReferenceIdentifierReader` is the surface Cargo's `#QbReferenceVerifier` calls at mapping-edit time, and it exists because two shipped criteria are otherwise unsatisfiable together: `AC-CARGO-018.48` obliges Cargo to read a mapping record's identifier from QuickBooks before saving it, and `AC-KIT-011.42` forbids any Cargo source file from constructing a QuickBooks Accounting API request. One of the two has to give, and the one that gives is the package's export list (ADR-015).

`#ReferenceIdentifierReader` reads through `#LockedTokenRefresher` on the same tenant key as a write, so a mapping edit is a second consumer of the shared token — which is the ordering consequence: the mapping-edit surface cannot ship before the custody driver it borrows a token from. It contends for the advisory lock only on the rare stale path, because `AC-KIT-009.22` returns a fresh record without taking the lock at all.

`#AdapterGroupDispatcher` receives a `RoutingMap` from Ledger and nothing from Cargo, which is the whole of the asymmetry `AC-KIT-010.25` creates: Ledger routes a group at the hosted adapter it injects, Cargo supplies no map and every group resolves to the adapter the package exports. Holding the dispatch in the package rather than in each consumer is what keeps `AC-KIT-011.43`'s negative — no Cargo file supplies an adapter — a property of Cargo's code rather than of Cargo's restraint (ADR-016).

`#SelfHostedRestAdapter` receives its HTTP call as an injected function and constructs the request bytes, so `#BillCreationGateChain` and `#ReferenceIdentifierReader` produce one request shape across both products. `#PerLineClassRefGate` reads the declaration this adapter carries rather than a claim about it, which is why that declaration must be dated (ADR-014, `AC-KIT-008.21`).

### Token custody

```component
name: TokenCustodyContract
container: paver-os/kit (@paver/qb)
responsibilities:
  - Declaring `read(tenantKey)`, `withLock(tenantKey, mutate)` and `describe()` as the whole of token custody (AC-KIT-009.1)
  - Binding to no storage medium and accepting any value satisfying the interface (AC-KIT-009.2)
```

```component
name: LockedTokenRefresher
container: paver-os/kit (@paver/qb)
responsibilities:
  - Returning the record read OUTSIDE the lock without taking the lock at all when it is fresh (AC-KIT-009.22)
  - Re-evaluating the freshness of the record read INSIDE the lock and returning it unexchanged when it is still valid (AC-KIT-009.17)
  - Performing every refresh-token exchange inside the locked operation, bounded by a caller-supplied timeout, and abandoning the exchange when it elapses (AC-KIT-009.3, AC-KIT-009.23, AC-KIT-009.24)
  - Writing no token record and refusing when an exchange is abandoned (AC-KIT-009.25, AC-KIT-009.26)
  - Performing no outbound request other than the exchange while the lock is open (AC-KIT-009.27)
  - Writing the rotated record through the driver before returning any token to the caller (AC-KIT-009.8)
  - Refusing with the same named error it raises on a past-expiry refresh token when that write fails, so one error means "re-authorize" on every path that ends the connection (AC-KIT-009.9, AC-KIT-009.10, AC-KIT-009.19)
```

```component
name: TokenRecordCipher
container: paver-os/kit (@paver/qb)
responsibilities:
  - Encrypting and decrypting a `TokenRecord` as pure functions over the record and the secret, holding no state and touching no storage (AC-KIT-009.11)
  - Refusing a secret shorter than 32 characters (AC-KIT-009.12)
  - Refusing a record whose authentication tag does not verify, without distinguishing a wrong key from an altered record (AC-KIT-009.13)
```

```component
name: PostgresAdvisoryLockTokenDriver
container: paver-os/kit (@paver/qb — postgres entry point)
responsibilities:
  - Being the database-backed token-custody driver the package exports, so both consumers lock one stored record through one artifact (AC-KIT-009.30, ADR-010)
  - Implementing `#TokenCustodyContract` over the `qb_token` row, taking `pg_advisory_xact_lock` over a hash of the tenant key as the first statement of the transaction that reads, exchanges and writes (ADR-001, ADR-010)
  - Committing an exchange-intent row in its own transaction BEFORE the lock transaction opens, and clearing it only after the rotated record is durably written, because a rollback erases every field written inside the lock (ADR-001)
  - Returning no record stored under a tenant key other than the one requested, which is the property `#CustodyConformanceSuite` grades it on (AC-KIT-009.20)
  - Taking its database handle as a caller-supplied argument rather than importing a database library, so this entry point's import graph reaches no filesystem module (AC-KIT-009.31, AC-KIT-010.1 through AC-KIT-010.4, ADR-010)
```

```component
name: CustodyConformanceSuite
container: paver-os/kit (@paver/qb)
responsibilities:
  - Running its concurrency criteria across separate operating-system processes contending for one stored record (AC-KIT-009.5)
  - Failing a driver that permits two processes to hold the lock over one tenant key at the same time (AC-KIT-009.6)
  - Failing a driver whose locked operation permits a second caller to read the stored record before the first caller's write completes (AC-KIT-009.7)
  - Failing a driver that returns a record stored under a tenant key other than the one requested (AC-KIT-009.20)
  - Failing a driver whose lock is still held after the process that took it exits without completing its operation (AC-KIT-009.28)
  - Grading lock semantics and tenant scoping only, and never the number of exchanges performed (AC-KIT-009.21)
  - Running its criteria over the same connection route the consumer uses in production (AC-KIT-009.29)
```

`#LockedTokenRefresher` calls `#TokenCustodyContract.withLock` and performs the read → freshness re-check → exchange → persist sequence inside it, so the HTTP exchange is inside the lock rather than beside it. The re-check is what makes serialization sufficient: two perfectly serialized processes both exchange unless the second one, seeing the record the first wrote, declines to (ADR-006). Ledger already does this at `oauth.ts:199-202`, and `AC-KIT-009.17` now requires it.

`#LockedTokenRefresher` reads the record once **before** taking the lock and returns it untouched when it is fresh, so the common path — every request inside an access token's lifetime — costs no lock and no contention (`AC-KIT-009.22`). That is the bound that makes an HTTP call inside a transaction affordable rather than merely accepted: the transaction opens roughly once per access-token lifetime, not once per post.

`#TokenRecordCipher` is called by a driver, not by `#LockedTokenRefresher`, so custody of the ciphertext and custody of the plaintext stay in one place — the driver — and the package never decides where bytes land. Ledger's `encryptRecord`/`decryptRecord` (`token-store.ts:73,86`) move across verbatim, including the AES-256-GCM envelope and the `scryptSync(secret, 'ledger.quickbooks.tokenstore.v1', 32)` derivation, because changing the salt would make every existing ciphertext unreadable for no gain.

`#PostgresAdvisoryLockTokenDriver` ships from this package rather than from either consumer, because both consumers lock the same row and a driver built inside one repository is unimportable from the other (ADR-010). It receives a queryable from the consumer and imports no database library itself, which keeps `#ServerlessSurfaceGuard`'s import-graph walk over this entry point clean and leaves connection and pool policy where it belongs — with the runtime that opens the socket.

`#PostgresAdvisoryLockTokenDriver` writes the exchange-intent row **outside** the transaction `#LockedTokenRefresher` performs its exchange in, and that placement is the whole mechanism: anything written inside that transaction disappears with it, so a holder killed after Intuit returned a rotated token leaves state byte-identical to a holder that never called Intuit at all. A committed intent row is the only evidence that survives the rollback, and the driver rather than the refresher owns it because the driver is what owns the transaction boundary (ADR-001). The row's table belongs to the consumer's migration, not to the package.

`#CustodyConformanceSuite` grades a driver, not the package. The exchange-count property belongs to `#LockedTokenRefresher` and is tested in the package against a stub driver (`AC-KIT-009.18`); `AC-KIT-009.21` now forbids the suite from grading it, so a correct `pg_advisory_xact_lock` driver can no longer be failed for a package obligation (ADR-006).

`#CustodyConformanceSuite` is run by each consumer against the driver that consumer actually deploys, over that consumer's production connection route — Cargo's own test command under `AC-KIT-011.30`, Ledger's under `AC-KIT-011.31` — because a suite that ships and is never executed against the deployed driver is a guarantee nobody holds. ADR-010 pins both consumers to one route so one grade covers both.

`#CustodyConformanceSuite` grades contention across operating-system processes without asking which product started them (`AC-KIT-009.5`), which is what makes it the right instrument under operator decision D4: one Intuit application means one rotating refresh token shared by Cargo's serverless instances **and** Ledger's CLI, so a `ledger auth` run on a laptop during a Cargo post is the same race as two Cargo instances (ADR-002).

### Serverless surface

```component
name: ServerlessSurfaceGuard
container: paver-os/kit (@paver/qb)
responsibilities:
  - Walking the transitive import graph of the built output's public entry points — default, break-glass and postgres — and failing on `node:fs`, `node:path` or `node:child_process` (AC-KIT-010.1 through AC-KIT-010.4)
```

```component
name: GateContractVersion
container: paver-os/kit (@paver/qb)
responsibilities:
  - Exporting an integer that increments whenever any gate named in @REQ-KIT-008 changes behaviour, and whenever the grant table gains a WRITE method for any identity (AC-KIT-011.14, AC-KIT-012.11)
  - Giving each consumer a value its own in-repo test can assert without reading another repository (AC-KIT-011.21, AC-KIT-011.27)
```

`#ServerlessSurfaceGuard` walks the **built** graph rather than the source directory, because a re-export slips a filesystem import past a source grep. Ledger's `change-plan.ts:1-2` carries a module-level `node:fs` import beside pure hash functions, which is precisely the shape that survives a naive check and breaks the bundle at `AC-KIT-010.5`.

`#GateContractVersion` is read by a test in Cargo (`AC-KIT-011.27`) and a test in Ledger (`AC-KIT-011.21`), each asserting the value that repository was built against. A gate change bumps the integer, and both consumers go red in their own repositories with no cross-repo assertion (ADR-008).

## System Contracts

### Key Contracts

**No write reaches QuickBooks without a capability token.** Every write method the package exports — the normal bill path, the break-glass bill path, and `#GuardedWriteDispatcher`'s non-create dispatch — requires a token built from `#CapabilityGrantTable`. The package exports **no ungated contract surface**: there is no exported path that dispatches a QuickBooks write without a token (`AC-KIT-008.36`, `AC-KIT-008.39`). Reads are unguarded by design, because reading changes nothing.

**A token being present is not a token being checked, and the check is one question.** `#GrantSetMembershipGate` permits a write method by that method's membership in the token's grant set alone (`AC-KIT-008.44`); an ungranted create and an ungranted update refuse on the same test (`AC-KIT-008.37`, `AC-KIT-008.43`), and no write method is exempt for not being a create. `AC-KIT-012.8` asserts the gate on **every** exposed write method and `AC-KIT-012.9` is the test that invokes each exported write path with a token that does not grant it (ADR-013).

**The approved payload is the dispatched payload.** The hashes `#ApprovalHashAssertion` recomputes cover the `CreateBillPayload` `#BillCreationGateChain` sends. No consumer re-derives lines between approval and dispatch (ADR-004, `AC-KIT-008.23`, `AC-KIT-008.24`, `AC-KIT-008.25`).

**Every create carries a content-derived idempotency marker, and the marker is first in its field.** `PlanId` and the provenance stamp share one field QuickBooks returns on a read; the marker leads so the probe's match is unaffected by the stamp that follows it (ADR-005, ADR-011, `AC-KIT-008.40`).

**Every create says which identity and which grant kind made it, and no later write erases that.** `#BillProvenanceStamper` writes identity, kind, and the break-glass reason where one applies; `#PostWriteBillVerifier` reports a bill returning without an identity as not verified (`AC-KIT-012.23` through `AC-KIT-012.26`); and `#GuardedWriteDispatcher` does not modify that field on a non-create write (`AC-KIT-012.30`). This is advisory provenance, not proof — decided as such by operator decision D4 (`@REQ-KIT-008` Closed Question 4), and recorded at Known Risks.

**At most one system normally holds a given WRITE method, at most one holds it break-glass, and no system holds both.** The property is checked by `#GrantPartitionChecker` over the table as data, so a grant change is a data change the existing test re-runs against unchanged (`AC-KIT-012.3`, `AC-KIT-012.16`, `AC-KIT-012.18`, `AC-KIT-012.6`, ADR-012). A write method granted to nobody is compliant — `createJournalEntry` and `updateJournalEntry` are the cases that exist today (`AC-KIT-012.28`). The rule is stated over write methods rather than entity types because that is the level authorization operates at: a `Bill` has one normal creator (Cargo) and one normal updater (Ledger), which is one writer per change origin rather than two writers of one entity.

**The package exports only an adapter that can carry a per-line class, and never one that spawns a subprocess.** `AC-KIT-010.20` and `AC-KIT-010.7` make that a property of what is exported, so `AC-KIT-008.20`'s runtime refusal is a second control rather than the only one (ADR-014).

**The exported adapter's per-line-class capability is a dated measurement, not a claim.** `AC-KIT-008.21` refuses a create when the receiving adapter's declaration carries no measurement date, and the package holds no by-construction exemption of the kind `vendor-bill.ts:630-658` grants. An adapter shipped with `measuredAt: null` therefore refuses every create rather than posting on an unverified claim (ADR-014, ADR-007).

**Every QuickBooks Accounting API request in the fleet is constructed inside this package — reads included.** `#ReferenceIdentifierReader` exists so `AC-KIT-011.42`'s absolute negative on Cargo and `AC-KIT-011.39`'s on Ledger stay absolute: a consumer that must resolve an identifier against the live chart routes through the package rather than reaching for the runtime's own fetch (ADR-015). The read resolves **by identifier and returns a name**, never the reverse, because a name-shaped lookup is how a colliding leaf account becomes a verified mapping.

**Reads carry no capability token and no grant.** A read changes nothing, so `#GrantSetMembershipGate` is not on the read path and `#CapabilityGrantTable` gains no entry for a workflow that only looks things up (ADR-009, ADR-015).

**No module inside the package invokes the break-glass path.** A refusal on the normal path refuses; it never falls back (`AC-KIT-012.27`).

**No gate has a caller-supplied opt-out.** Ledger's `recheckDuplicate` flag (`vendor-bill.ts:1065`) does not cross. A payload with no document number refuses rather than skipping the probe (`AC-KIT-008.22`, `AC-KIT-008.26`, ADR-005, ADR-007).

**Every refresh exchange happens inside the lock, and only when the record read inside the lock is stale.** Both halves are required; either alone permits a double exchange (ADR-006). A record already fresh when read outside the lock is returned without taking the lock at all (`AC-KIT-009.22`).

**Nothing but the exchange goes out while the lock is open, and the exchange is timed out.** A timeout abandons the exchange, writes no record, and refuses (`AC-KIT-009.23` through `AC-KIT-009.27`).

**A rotated refresh token is persisted before any token is returned.** A persist failure refuses with the same named error as an expired refresh token, because the token has already been spent at Intuit (`AC-KIT-009.8`, `AC-KIT-009.9`, `AC-KIT-009.19`, ADR-001).

**The lock is cross-product, not merely cross-process.** Under operator decision D4 both consumers authenticate as one Intuit application against one rotating refresh token, so mutual exclusion must hold between Cargo's N serverless instances and Ledger's local CLI. `AC-KIT-009.5` grades contention across operating-system processes without naming a product, and `AC-KIT-011.30` and `AC-KIT-011.31` oblige each consumer to run that grading on the driver it deploys (ADR-002).

**A rollback erases the evidence that an exchange happened, so the evidence is committed first.** `generation` and `rotated_at` are written inside the lock transaction and cannot distinguish "we exchanged and lost the result" from "we never exchanged". The exchange-intent row is committed in its own transaction before Intuit is called and cleared only after the rotated record is durably written (ADR-001). What a stranded intent should then do — refuse with `ReauthorizationRequired` or retry within a grace window — depends on Intuit behaviour this chain has not sourced, and is `@REQ-KIT-008` Open Question 2.

**The realm is read, never passed.** A QuickBooks request takes its realm identifier from the token record read under that request's tenant key, and the package accepts no realm argument beside the tenant key (`AC-KIT-009.32`, `AC-KIT-009.33`). A caller-supplied pair that disagreed would post into another company and the post-write re-read of `AC-KIT-008.11` would verify it, because it reads back from that same wrong company.

**Reported figures derive only from the post-write fetch.** Vendor, total and line count are compared against the approved values; a mismatch is reported, not thrown, because the payable already exists (`AC-KIT-008.16`). The same rule governs non-create writes (`AC-KIT-008.38`, `AC-KIT-008.42`).

**Every outbound request is bounded and the sequence is countable.** Each outbound request takes a caller-supplied timeout (`AC-KIT-010.17`) and the README states the maximum number the guarded write path performs in sequence, so a consumer can size its function's execution limit against their sum (`AC-KIT-010.18`). That maximum is **five**: the refresh exchange (only when stale), the vendor-plus-document-number probe, the marker probe, the create, and the re-read. A create whose timeout elapses reports existence as unknown rather than as failed (`AC-KIT-010.19`, `AC-KIT-008.33`). The consumer's half of the budget is `@blueprint:cargo-container-blueprint` ADR-023.

**The package reads no environment variable.** `AC-KIT-009.16`'s README obligation is documentation of the keys a *consumer* is expected to set; the client identifier and client secret reach the package as arguments (`AC-KIT-010.11`, `AC-KIT-010.15`). The realm is not one of them (`AC-KIT-009.33`).

**Neither consumer defines a token-custody driver.** Cargo defines none at all (`AC-KIT-011.32`); Ledger keeps only the filesystem driver named in `@REQ-KIT-008`'s Scope Boundary, for offline fixtures and tests (`AC-KIT-011.33`, asserted in-repo by `AC-KIT-011.34`). Two implementations of one lock over one rotating credential is the failure ADR-001 exists to prevent, reintroduced by repository layout.

### Integration Contracts

```
ConsumerSystem = 'cargo' | 'ledger'

GrantKind = 'normal' | 'break-glass'

WriteMethod                      // declared as data; the grant table's values are drawn
                                 // from it, so an undeclared method cannot be granted
                                 // (AC-KIT-012.10). Today the six of method-groups.ts:56-70:
                                 // createBill, updateBill, updateBillPayment,
                                 // updatePurchase, createJournalEntry, updateJournalEntry.
                                 // Creates are a SUBSET, not a separate vocabulary — there
                                 // is no CreateMethod type, deliberately (ADR-013).

ConsumerWorkflow                 // closed union the package owns (ADR-003)
  = 'cargo-factory-bill'
  | 'ledger-vendor-bill'
  | 'ledger-reconcile' | 'ledger-expense-review' | 'ledger-categorize'
  | 'ledger-close'     | 'ledger-forecast'       | 'ledger-anomalies'
  | 'ledger-margin'    | 'ledger-chase'          | 'ledger-tax-prep'
  | 'ledger-brief'     | 'ledger-fetch-bills'

GrantTableEntry {
  identity: ConsumerWorkflow
  system: ConsumerSystem                        // AC-KIT-012.2 — named, not inferred from the string
  writes: ReadonlyArray<{ method: WriteMethod, kind: GrantKind }>     // AC-KIT-012.1, AC-KIT-012.17
}                                               // one set; a create and an update sit in it
                                                // side by side and nothing reads them apart

GrantTable = ReadonlyArray<GrantTableEntry>     // supplied to #GrantPartitionChecker; AC-KIT-012.13

CapabilityToken {
  identity: ConsumerWorkflow
  system: ConsumerSystem
  grants: ReadonlyMap<WriteMethod, GrantKind>   // built only from the table; AC-KIT-008.2
}                                               // membership in `grants` is the WHOLE
                                                // authorization decision; AC-KIT-008.44

CreateBillPayload {
  vendorId: string
  docNumber: string              // never null; ADR-005
  txnDate: string
  currency: string
  lines: BillLine[]              // every line carries classId; no default
  provenanceField: string        // composed by #BillProvenanceStamper: marker first, stamp after
}

ProvenanceStamp {                // the segment following the marker in provenanceField
  identity: ConsumerWorkflow     // AC-KIT-012.23
  kind: GrantKind                // AC-KIT-012.24
  reason: string | null          // required and non-empty when kind is 'break-glass'; AC-KIT-012.25
}

BillMapping {                    // caller-supplied; AC-KIT-010.9
  vendorId: string
  accountIdFor(brand, lineKind): string
  classIdFor(brand): string
}

GuardedBillResult {
  planId: string
  billId: string | null          // non-null on every path where a create succeeded
  existence: 'created' | 'unknown'   // 'unknown' on the lost-response path; AC-KIT-008.33
  verified: boolean              // derived only from the post-write fetch
  discrepancy: { field: 'vendorId' | 'totalAmount' | 'lines.length' | 'provenance',
                 approved: unknown, fetched: unknown } | null
  error: string | null
}

TokenRecord {                    // as Ledger's, plus custody metadata
  accessToken, refreshToken: string
  accessTokenExpiresAt, refreshTokenExpiresAt, obtainedAt: number
  realmId: string                // the ONLY source of a request's realm; AC-KIT-009.32
  environment: 'sandbox' | 'production'
  generation: number             // increments on every successful exchange, INSIDE the lock
                                 // transaction — so it is an audit field, not a recovery
                                 // signal. It cannot tell a lost exchange from no exchange,
                                 // because a rollback erases it too. ADR-001.
}

ExchangeIntent {                 // committed in its OWN transaction before Intuit is called,
  tenantKey: string              // cleared after the rotated record is durably written.
  openedAt: number               // A row that survives its holder is the only evidence an
  holder: string                 // exchange may have happened. ADR-001; table owned by the
}                                // consumer's migration, statements by the driver.

Queryable {                      // injected into #PostgresAdvisoryLockTokenDriver; ADR-010
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
}

ReferenceKind = 'account' | 'class' | 'item' | 'vendor'   // ADR-015. Four, because a bill
                                                          // payload carries an identifier of
                                                          // each. The contract exposes no class
                                                          // read today, so this is an addition.

ReferenceLookup {                // #ReferenceIdentifierReader's INPUT. Identifier in — never a
  kind: ReferenceKind            // name, because an account name on a transaction is fully
  id: string                     // qualified while a search returns the leaf, and leaves collide.
  timeoutMs: number              // AC-KIT-010.17; every outbound request is bounded
}

ReferenceRecord {                // its OUTPUT. `null` is "QuickBooks returned nothing for this
  id: string                     // identifier", which is what AC-CARGO-018.49 refuses on. A read
  name: string                   // ERROR is not a null — an error never reads as an absence,
  active: boolean                // the same rule AC-KIT-008.31 holds for the duplicate probe.
} | null

Adapter {                        // ADR-016 — the package owns this shape because AC-KIT-010.25
  capabilities: AdapterCapabilities   // obliges it to ACCEPT one. Ledger's hosted adapter
  ...contract methods            // implements it and is injected; Cargo injects nothing.
}

RoutingMap                       // stays in Ledger's tenant config and is SUPPLIED to
                                 // #AdapterGroupDispatcher. Absent, every group resolves to
                                 // #SelfHostedRestAdapter — which is Cargo's whole story.
```

`BillMapping` is an interface the consumer implements, not a data file the package loads. Cargo resolves it from Postgres (`@blueprint:cargo-container-blueprint` ADR-019); Ledger's break-glass path resolves it from the same source. Neither shape enters the package.

`Queryable` is the seam that keeps the shared custody driver serverless-safe: Cargo supplies a pooled client over the transaction pooler and Ledger supplies its own over the same route, and neither connection policy reaches into the package (ADR-010).

### Integration Boundaries

| Concern | Owner | Not the owner |
|---|---|---|
| Which workflow may call which **write method**, and under which grant kind | `#CapabilityGrantTable` | Either consumer |
| Whether a token permits a given write method | `#GrantSetMembershipGate` | `#BillCreationGateChain`, `#GuardedWriteDispatcher`, either consumer |
| The realm a request addresses | The stored `TokenRecord` | Any caller argument |
| Whether a grant table satisfies the partition | `#GrantPartitionChecker` | Either consumer's test |
| Which QuickBooks adapter may be exported | ADR-014 (`AC-KIT-010.7`, `AC-KIT-010.20`) | The consumer that injects one |
| The construction of every QuickBooks Accounting API request, read and write alike | `#SelfHostedRestAdapter` (ADR-014, ADR-015) | Either consumer (`AC-KIT-011.39`, `AC-KIT-011.42`) |
| The adapter interface, the capability-declaration shape, and method-group dispatch | `#AdapterGroupDispatcher` and the types beside it (ADR-016) | Ledger's `router.ts`, `capabilities.ts` |
| Which adapter a method group routes to, and the measurement behind a hosted claim | Ledger's `RoutingMap` and `#CapabilityDiffer` (connector ADR-002, ADR-004) | This package |
| Resolving a QuickBooks identifier to the name QuickBooks holds for it | `#ReferenceIdentifierReader` (ADR-015) | Cargo's `#QbReferenceVerifier`, which calls it |
| Which mapping identifiers are worth verifying, and when a mapping row is unusable | Cargo (`@blueprint:cargo-container-blueprint` ADR-019) | This package |
| Construction of the change plan and its hashes | `#VendorBillPlanBuilder` | Either consumer |
| The approval-hash recomputation and the post-write verification, for creates and non-creates alike | `#ApprovalHashAssertion`, `#PostWriteBillVerifier`, `#GuardedWriteDispatcher` | Ledger's `src/qb/` (deleted, `AC-KIT-011.2`) |
| The lock protocol over the shared token row | `#PostgresAdvisoryLockTokenDriver` | Either consumer's repository |
| The database connection and pool policy under that driver | The consumer's runtime | This package |
| Where the token bytes live | The custody driver | The package |
| Whether the deployed driver's lock is correct | `#CustodyConformanceSuite`, run in the consumer's build | The driver's author |
| Vendor, account and class mapping | Cargo Postgres (ADR-019, Cargo blueprint) | This package |
| HTTP transport | The consumer's runtime | This package |
| Client id, client secret, encryption secret | The consumer's environment | This package |
| The function execution limit the write path must fit inside | Cargo (`@blueprint:cargo-container-blueprint` ADR-023) | This package |
| The preview screen shown before the write | Cargo (`@REQ-CARGO-018`) | This package |

## Architecture Decision Records

> Format note: these ADRs extend the house `Context · Decision · Consequences` shape (`architect/templates/adr.md.tmpl`) with **Options considered** and **How we would know this is wrong**, at the operator's request for this decision set. The three house fields are unchanged.

### ADR-001: Token custody is one Postgres row, locked by `pg_advisory_xact_lock` around the whole exchange

**Context:** Intuit rotates the refresh token on every exchange. Ledger serializes exchanges with an in-process promise chain (`token-store.ts:115,137-144`), which is correct for one process and worthless for N. Cargo runs on Vercel, where N concurrent instances are the normal case. Two instances exchanging the same refresh token invalidate the QuickBooks connection; posting then fails 401 and presents as an authentication bug rather than a race — the failure `@REQ-KIT-009` exists to prevent, and the one that costs the whole connection rather than one bill.

**Options considered:**

| Option | Real trade-off |
|---|---|
| `SELECT … FOR UPDATE` on the token row inside a transaction | A true row lock, visible in `pg_locks`, familiar. But it can only lock a row that exists — the first authorization, and any recovery that rewrites the record, have no row to lock, so the very moments the lock matters most are unprotected unless a sentinel row is created and defended separately. |
| `pg_advisory_xact_lock(key)` taken as the first statement of the transaction | Locks a key, not a row, so it holds before the record exists and through a delete-and-rewrite. Held to end of transaction and released on commit, rollback **or disconnect**, which matters when the holder is a serverless function that was frozen mid-flight — and which is what `AC-KIT-009.28` grades. Cost: the lock is invisible in the schema and must be documented, and the key is a 64-bit hash whose collision domain is shared with any other advisory lock in the database. |
| Session-scoped `pg_advisory_lock(key)` | Disqualified by the connection route, not by taste. Both consumers reach Postgres through Supabase's **transaction-mode** pooler (ADR-010), where a session-scoped lock outlives the statement that took it and is inherited by whichever caller next receives that multiplexed backend. `AC-KIT-009.28` fails exactly this driver. |
| `SERIALIZABLE` isolation, letting Postgres abort the loser | Disqualifying, not merely worse. The HTTP exchange is not transactional: by the time Postgres detects the conflict and aborts, the loser has already spent the refresh token at Intuit. Serializable converts a race that *might* lose the connection into one that reliably does. |

**Decision:** Token custody is a single row per tenant key in Cargo's Supabase Postgres (project `ezzfbtqcdyxxilpumzkw`), and `withLock` is implemented as a transaction whose first statement is `pg_advisory_xact_lock` over a hash of the tenant key, followed by read → freshness re-check → exchange → write → commit. Specifically:

- **Schema** — table `qb_token`: `tenant_key text primary key` (`{realm}:{environment}`, satisfying `AC-KIT-009.14`/`AC-KIT-009.15`), `realm_id text`, `environment text` checked against `('sandbox','production')`, `ciphertext text` holding `#TokenRecordCipher`'s envelope verbatim, `generation bigint not null default 0`, `rotated_at timestamptz`, `updated_at timestamptz`. **No RLS policy grants any role access**; the row is reachable only by the service role from a server route, never by an authenticated browser session.
- **Transaction mode, and no prepared statements.** The route is the shared transaction pooler (ADR-010), so the driver must disable prepared statements and must take only transaction-scoped locks. Both are properties `#CustodyConformanceSuite` grades over the production route (`AC-KIT-009.28`, `AC-KIT-009.29`).
- **Contention behaviour — wait, bounded, then fail closed.** `SET LOCAL lock_timeout` bounds the wait (order of seconds). Waiting is right because the common contended case is "the other instance is exchanging right now" and the waiter then finds a fresh token for free; failing immediately would turn an ordinary second click into a user-visible error. The bound is right because an unbounded wait lets a wedged holder pile serverless functions up until the connection pool is exhausted. On timeout the call **refuses and posts nothing** — it never proceeds without the lock.
- **Ordering — persist before returning.** Exchange → write → commit → return. A caller never holds an access token whose rotated refresh token is not committed. What the alternative loses: returning first and persisting asynchronously means a persist failure leaves a spent refresh token unstored and the connection dead, discovered later by a 401 rather than immediately by a refusal. What *this* ordering loses: a write or commit failure after a successful exchange also ends the connection — but it ends it loudly, at the moment it happens, with `AC-KIT-009.9`'s refusal.
- **The lock is not opened on the common path.** `AC-KIT-009.22` returns a fresh record read outside the lock without taking it, so the transaction opens about once per access-token lifetime rather than once per post. This is the bound that makes the HTTP-inside-a-transaction smell affordable.
- **Copies — nobody else holds one.** One ciphertext row is the only durable copy. No refresh token in a `.env`, in Vercel environment variables, in either repository, or in an MCP configuration file. Plaintext exists only in memory for the life of one request.
- **Recovery after a botched rotation — and the claim this ADR previously made here is withdrawn.** Revision 1 stated that "`generation` increments on every successful exchange and `rotated_at` stamps it, so the recovery path can distinguish 'we exchanged and lost the result' from 'we never exchanged'." **That is false, and the mechanism above is why.** Both fields are written by the same transaction the `pg_advisory_xact_lock` is scoped to, so both disappear on the rollback that a killed or frozen holder produces — and `pg_advisory_xact_lock` releases on disconnect precisely so the next caller is not blocked by a dead one. A serverless function frozen after Intuit returned a rotated token therefore leaves the row byte-identical to a function that never called Intuit at all: same ciphertext, same `generation`, same `rotated_at`, no lock. The two states the recovery path most needs to tell apart are the two states this design made indistinguishable. `WO-KIT-002`'s added AC 2 found this; it is a real defect in a decision of mine, not a Work Order overreach.

  **The mechanism that does distinguish them is a record committed before the exchange, not a field written during it.** `#PostgresAdvisoryLockTokenDriver` writes an `ExchangeIntent` row for the tenant key and **commits it in its own transaction** before opening the lock transaction, and clears it only after the rotated record is durably written. Three states then exist and are readable from the database alone: no intent (nothing was attempted), an open intent with a live lock (an exchange is in flight now), and an open intent with no lock holder (**a holder died at or after the exchange — the refresh token may already be spent**). `generation` and `rotated_at` remain as audit fields, which is what they are good for; they are not recovery signals and this ADR no longer claims they are.

  **What a stranded intent should do is not decided here, and must not be guessed.** Refusing with `ReauthorizationRequired` is correct if Intuit invalidates the prior refresh token the instant a new one is issued; a bounded retry is correct if Intuit honours a grace window on the prior token. **That behaviour is unsourced in this chain** and CLAUDE.md's spec-first rule forbids specifying against it — the Requirement half is `@REQ-KIT-008` Open Question 2, which needs the Intuit reference and then one AC in `@REQ-KIT-009`. What is decided here is that the intent row exists and is committed first, because *neither* answer is implementable without it.

- **The refusal path, which is unaffected by the above.** On any of: decrypt failure, `invalid_grant` from Intuit, or `AC-KIT-009.9`'s persist failure, the package refuses every subsequent call with a single named error (`ReauthorizationRequired`) rather than passing a 401 through — so the surface reads "reconnect QuickBooks", not "auth bug". The recovery action is operator-gated re-consent performed by Ledger's `ledger auth` command, which writes the new record into the same shared store; Cargo therefore never ships an OAuth redirect surface, and re-consent stays a deliberate act on a machine that already holds the client secret. Secret rotation follows the same path: rotate, delete the row, re-consent — never re-encrypt in place, because a half-rotated secret is indistinguishable from tampering by design (`AC-KIT-009.13`, `token-store.ts:100-106`).

**Consequences:** We now own a custody path that is correct under concurrency and whose failure mode is a named refusal rather than a mystery 401. We now also own an HTTP call inside an open Postgres transaction — normally a smell, and named here rather than hidden. It is accepted because a lock that does not span the exchange does not prevent the failure, and it is bounded four ways: `AC-KIT-009.22`'s no-lock common path, `lock_timeout` on the waiter, `AC-KIT-009.23`'s exchange timeout on the holder, and `AC-KIT-009.27`'s prohibition on any other outbound request while the lock is open. The intent row is a second table and a second commit on the exchange path — a real cost, paid only on the rare stale path, and the price of the transaction-scoped lock being the thing that makes the design safe *and* the thing that erases its own audit trail. Cargo's Supabase becomes a dependency of Ledger's bill path (ADR-002), and under D4 the lock is contended by both products, not only by Cargo's instances. The advisory lock is invisible in the schema, so its existence must be documented at the driver and in the runbook or a future engineer adds a second, unsynchronized writer.

**How we would know this is wrong:** an open `ExchangeIntent` row with no lock holder, appearing more than exceptionally — each one is a token that may have been spent and lost. Any `invalid_grant` from Intuit. A `ReauthorizationRequired` occurring more than once between deliberate re-consents. `generation` advancing more than once per access-token lifetime. `lock_timeout` refusals appearing under normal single-operator load, which would mean the lock is held longer than the exchange takes and the transaction is doing work it should not. Or a recovery procedure written against `generation` — which would mean the withdrawn claim above outlived its withdrawal.

### ADR-002: One Intuit application, one token lineage, one shared store; Ledger's file driver leaves production

**Context:** Revision 2 of `@REQ-KIT-008` left unresolved whether Ledger migrates to the shared store or keeps the encrypted file at `token-store.ts:111`. Ledger's own header comment (`token-store.ts:5-18`) says the file driver is safe *because* Ledger runs under its own Intuit application, so no second process competes for one token lineage. Cargo posting bills changes that premise only if the two products share an application. Revision 3 of the Requirement closed the store question (Closed Question 2) on the terms this ADR set; **operator decision D4 (2026-08-14) closes the application question the same way** — one application, two-application attribution rejected — which is what turns "one lineage" from this ADR's preference into the fleet's constraint.

**Options considered:**

| Option | Real trade-off |
|---|---|
| Two Intuit applications, two lineages; Ledger keeps its file | No contention, no migration, and Ledger's existing driver stays. But two client secrets to hold and rotate, two consent flows, two entries in Intuit's connected-apps list, and — decisively — the file driver is never graded by `#CustodyConformanceSuite`, so exactly one of the two products runs a lock nobody measures. That is the drift this extraction exists to end, re-created in the custody layer. The one thing it would buy is real platform-level attribution. **Rejected by the operator, decision D4:** the only failure real attribution catches is a compromised consumer, and a compromised consumer holding the grant writes a truthful stamp anyway. |
| One application, one shared store, Ledger reads it too | One lineage, one secret, one consent, one driver, and `AC-KIT-009.5`'s cross-process criterion covers the CLI as one more contender the lock already handles. Cost: Ledger acquires a Supabase dependency it does not have today, and the CLI stops working with no network to Cargo's database. |
| One application, shared store for Cargo, file for Ledger | The worst of both: one lineage with two uncoordinated locks. Two drivers over one rotating token is the exact failure ADR-001 prevents, reintroduced by configuration. Rejected outright. |

**Decision:** One Intuit application, one token lineage, one shared store — ratified by operator decision D4, not merely preferred. Ledger's `FileTokenStore` is retired as a production driver and retained only for offline fixtures and tests; `AC-KIT-010.6` already forbids the package from exporting a filesystem driver, and Ledger keeps its local copy for that narrow use (`AC-KIT-011.33`). Ledger's CLI reads and locks the same `qb_token` row through the same driver Cargo uses — the one this package ships (ADR-010) — so `AC-KIT-009.5` applies to Ledger too.

**The consequence that must be stated plainly rather than inferred: the token lock is CROSS-PRODUCT.** One application means one rotating refresh token, and that token is shared by a serverless deployment and a laptop. Mutual exclusion must therefore hold between Cargo's N instances **and** Ledger's CLI: an operator running `ledger auth`, or any Ledger command that touches QuickBooks, while a Cargo post is in flight is the same race as two Cargo instances, and neither process can see the other. Nothing in the criteria assumed otherwise — `AC-KIT-009.5` grades contention across operating-system processes without naming a product, and `.6`, `.7`, `.20` and `.28` are properties of the driver rather than of its caller — so no criterion was re-cut for D4. What was missing was the obligation to **run** that grading against each deployed driver, now `AC-KIT-011.30` (Cargo) and `AC-KIT-011.31` (Ledger). A driver graded only against processes of one product has not been graded against the contention that exists.

**Attribution is settled, and the two-application option is closed rather than deferred.** `@REQ-KIT-008` Closed Question 4 records D4: provenance is advisory, the stamp attests to what the package did rather than to what QuickBooks observed, and QuickBooks' own audit trail names the application and cannot separate Cargo from Ledger. What the stamp buys is that an **unstamped** bill means "not created through `@paver/qb`" — the QuickBooks-UI path, recovered by `@blueprint:cargo-container-blueprint` ADR-022's adoption. Any text in this Blueprint that read as though splitting the applications remained live is superseded by this paragraph.

**Reachability is settled by measurement, and there is no third-database fallback.** Revision 1 of this Blueprint treated pooler availability as unknown and named a separate IPv4 Postgres as a fallback. That text is withdrawn. Supabase project `ezzfbtqcdyxxilpumzkw` has a working shared pooler at `aws-1-us-west-2.pooler.supabase.com` — three IPv4 A records, transaction mode on `:6543` and session mode on `:5432`, both verified open on 2026-08-14, no paid add-on, user `postgres.ezzfbtqcdyxxilpumzkw`. **The earlier "no pooler on this project" conclusion was a hostname error and must not be re-derived:** the prefix is `aws-1-`, not `aws-0-`, and every `aws-0-<region>` attempt returns `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`, which reads as "this project has no pooler" and means "wrong host". The direct host `db.ezzfbtqcdyxxilpumzkw.supabase.co:5432` is IPv6-only — usable from a Mac with IPv6 up, unusable from a Vercel function — so serverless must use the pooler and the driver must therefore be transaction-mode-safe (ADR-001).

The encryption secret is **one value under two key names** — Cargo reads `CARGO_QB_TOKEN_SECRET`, Ledger keeps `LEDGER_TOKEN_SECRET` — because neither repository's environment schema should have to adopt the other's prefix and the two environment surfaces (Vercel, local shell) are separate anyway. The values must be equal; if they are not, the reader cannot decrypt what the other wrote and the error is deliberately indistinguishable from tampering (`AC-KIT-009.13`). The runbook consequence is stated in ADR-001: rotation is rotate → delete → re-consent, never re-encrypt in place.

**Consequences:** One thing to rotate, one thing to consent to, one driver graded by one conformance suite. Ledger gains its first database dependency and can no longer post a bill from a machine with no route to Supabase — acceptable, because Ledger's bill path is break-glass after ADR-011 and every other Ledger command is unaffected. One Intuit application means the provenance stamp is advisory permanently, not pending a decision, and it means the lock is contended by two products rather than by one product's instances.

**The git-tracked credential is a tracked risk with an owner, not a prerequisite — and Revision 2's text saying otherwise is withdrawn.** Measured 2026-08-14: `unicorn-ceo/.mcp.json` and Ledger use **different Intuit OAuth applications against the same production realm** — the same QuickBooks company. Two things follow and they point opposite ways. Rotating the tracked credential does **not** invalidate Ledger's refresh token, so it does not sit in front of this chain and does not gate Cargo's first production write; the earlier "rotation must happen before the first production write" clause assumed a shared application and is false. But that credential does write to the real books of the real company, so it is a live exposure with an owner and a date rather than a cleanup item. Key names only are recorded anywhere in this chain; no value has been read or reproduced. Remediation stays where Known Risks puts it: operator-gated, hard-gated, performed by Tony.

**How we would know this is wrong:** Ledger's CLI failing on a machine where it used to work, often enough that operators start asking for the file driver back. A second Intuit application appearing in the connected-apps list, which after D4 would mean someone re-created the fork this ADR closed by accident rather than by decision. Or a conformance run whose contending processes are all Cargo's, which would mean the cross-product half of the lock is asserted and not measured.

### ADR-003: The grant table is keyed by consumer workflow identity, and every workflow that writes gets one

**Context:** `AC-KIT-008.2` requires the grant table to live inside the package and forbids caller-supplied grants. Ledger's `CREATION_GRANTS` is keyed by `WorkflowName`, a closed union of twelve Ledger workflow names — `categorize`, `chase`, `tax-prep`, `close` and the rest (`creation-policy.ts:16-31,41-54`) — granting `createBill` to `'vendor-bill'` alone and `[]` to the other eleven. Revision 1 of this ADR kept those eleven names in Ledger's own `creation-policy`; `AC-KIT-011.2` deletes that file, so they have nowhere to live, and ADR-009 puts Ledger's non-create writes through the package's guarded contract, which needs a token for each of them.

**Options considered:** (a) ship Ledger's union as-is and have Cargo borrow `'vendor-bill'` — cheapest, and it hollows out the gate; (b) make the workflow name a free string and grant on a method allow-list — restores caller-supplied grants by the back door, violating `AC-KIT-008.2`; (c) re-key the table on a closed union of *consumer workflow identities* that the package defines, carrying every workflow in either system that dispatches a QuickBooks write.

**Decision:** (c). `#CapabilityGrantTable` is keyed by `ConsumerWorkflow`, a closed union the package owns. Each entry names the `ConsumerSystem` it belongs to as a field rather than by string convention (`AC-KIT-012.2`), and carries its **write** grants with the **kind** of each (`AC-KIT-012.1`, `AC-KIT-012.17`). Today: `cargo-factory-bill` holds `createBill` as a **normal** grant; `ledger-vendor-bill` holds `createBill` as a **break-glass** grant (ADR-011); the Ledger identities that dispatch non-create writes hold **normal** grants of `updateBill`, `updateBillPayment` and `updatePurchase` (`AC-KIT-012.29`, `AC-KIT-012.31`, `AC-KIT-012.32`); and `createJournalEntry` and `updateJournalEntry` are on the exposed write set and granted to nobody (`AC-KIT-012.28`). Adding a consumer is a package change with a `#GateContractVersion` bump — which is the point: a new writer to the general ledger should require a release, a review and a version increment, not a string literal in a route handler.

**Revision 2's "empty create-grant sets" is withdrawn, and the withdrawal is the whole of the Revision 4 fix at this ADR.** Copying `creation-policy.ts:41-54`'s idiom — one workflow granted `createBill`, eleven granted `[]` — was faithful to Ledger and wrong here. In Ledger that idiom meant "may update, may create nothing", because `assertMayCreate` returns early for every non-creation method (`creation-policy.ts:80-85`) and `WRITE_METHODS` is six methods against `CREATION_METHODS`' two (`method-groups.ts:56-70`), so four write methods were unauthorized by construction. That was tolerable while the process boundary *was* the authorization boundary and all twelve identities lived in one trusted local CLI. It stopped being tolerable when a second product's serverless identity entered the same table: an empty set then authorized nothing while permitting every update, and `cargo-factory-bill`'s `['createBill']` satisfied every gate on `updateBill`. The sets now name what each identity may write, and `#GrantSetMembershipGate` reads them without asking what kind of method it is holding (ADR-013).

**Consequences:** Ledger keeps no grant table of its own (`AC-KIT-011.24`), so there is one table in the fleet and no second place for a grant to be widened. Workflow identity becomes load-bearing in the books, because `#BillProvenanceStamper` writes it into every create. The package's public type surface now names its consumers and their workflows, which is a coupling the kit platform blueprint's leaf-package instinct (`@blueprint:paver-os-kit-platform` ADR-005) would normally reject; it is accepted because a grant table that does not name who is granted is not a grant table. The cost is that adding a Ledger workflow now touches the package — deliberate, since a workflow that writes to the books should not be able to appear without a release.

**How we would know this is wrong:** a third consumer arriving within a quarter, which would mean the closed union is a bottleneck rather than a gate. A consumer discovered passing another consumer's workflow identity. A grant set found empty for an identity that still writes — the exact shape of the defect this revision removed. Or a Ledger workflow shipping with a borrowed identity because adding its own required a package release the author did not want to make.

### ADR-004: The package builds the change plan from the payload it will dispatch

**Context:** Plan construction was unassigned in Revision 1 of the Requirement. `AC-KIT-008.3` through `AC-KIT-008.8` assume a plan with two hashes already exists; Ledger builds it in `planVendorBill` (`vendor-bill.ts:834`) and Cargo has no equivalent. In Ledger the binding between the hashed plan and the dispatched payload holds by construction — `asCreateBillInput(effectiveValue(item))` and `linesTotal(payload.lines)` derive from the same item (`vendor-bill.ts:1058-1059`) — but no Acceptance Criterion required it. A Cargo implementation that re-derives lines from `po_invoice.parsed` at post time and then hashes would satisfy `AC-KIT-008.4`/`.5` while the operator's approval covers nothing, and `AC-KIT-008.13`'s total check would compare the payload against itself and report "verified".

**Options considered:** (a) each consumer builds its own plan and the package ships only the hash functions — matches `AC-KIT-010.5`'s wording, and leaves the binding to two independent implementations, which is the drift the package exists to prevent; (b) the package builds the plan from a `CreateBillPayload` the consumer hands it — one implementation, one binding, and the consumer keeps ownership of *what* to bill; (c) the package builds the payload too, from a parsed invoice and a mapping — pulls the split-invoice rule and the account mapping into the shared layer, which `@REQ-KIT-008`'s Scope Boundary excludes.

**Decision:** (b). The consumer builds a `CreateBillPayload` and hands it to `#VendorBillPlanBuilder`, which constructs the `ChangePlan` whose single change's `proposedValue` **is** that payload, and computes both hashes over it (`AC-KIT-008.23`). `#BillCreationGateChain` dispatches that same object; nothing between approval and dispatch re-derives it (`AC-KIT-008.24`). The approved total and line count are read from the plan, not recomputed from a second traversal (`AC-KIT-008.25`). The package also exports the function that renders a plan for review (`AC-KIT-008.41`), because Ledger imports `presentPlan` outside the create path (`cli.ts:8`, `expense-review.ts:6`) and a second renderer would show an operator something the hash does not bind.

**Consequences:** The approval provably covers the bytes sent. The preview screen (`@REQ-CARGO-018`) renders the payload from the plan, so what the operator reads and what is hashed are the same artifact. `AC-KIT-010.5` is satisfied at the plan-builder's entry point rather than by a bare pair of functions; Ledger's `change-plan.ts:1-2` module-level `node:fs` import must be split out regardless. Cost: the plan shape becomes package-public, so changing it is a `#GateContractVersion` bump.

**How we would know this is wrong:** a consumer discovered computing a total from anything but `plan.changes[0].proposedValue`. Or a verified-true result on a bill whose lines do not match the approval an operator can still read.

### ADR-005: Every create carries a content-derived idempotency marker, and a null document number refuses

**Context:** `AC-KIT-008.9`'s "immediately before" narrows the duplicate window; it does not close it. Cargo's design is a button on a retrying serverless function: two clicks, or Vercel re-invoking after a function timeout on which the create actually committed, both pass the probe and both create. Ledger never faced this — one process, one shot. Two further holes: Ledger's probe is conditional on `payload.docNumber !== null` (`vendor-bill.ts:1065`) and `findExistingBill` cannot form a query without one (`vendor-bill.ts:681-690`), so an unnumbered invoice skips the gate silently; and when `createBill` throws, Ledger returns `createdBill: null` (`vendor-bill.ts:1085-1093`), so a timeout after QuickBooks committed leaves a real bill whose identifier nobody holds.

**Options considered:** (a) rely on the probe alone and accept the window — the failure is a duplicate payable in real money on the first watched write, which is not an acceptable first impression or an acceptable outcome; (b) a consumer-side claim row taken before dispatch — closes the two-clicks case but not the lost-response case, and puts the protection in one consumer rather than in the shared gate; (c) a content-derived marker carried into QuickBooks itself and queried by the probe — protection lives where the entity lives, so it holds across processes, across retries and across both consumers.

**Decision:** (c), with (b) as a cheap complement Cargo owns (`@blueprint:cargo-container-blueprint` ADR-022). `#VendorBillPlanBuilder` derives `PlanId` from the plan's content — the same construction as Ledger's `derivePlanId` (`change-plan.ts:143-145`), already documented there as an idempotency key. `#BillProvenanceStamper` writes `PlanId` into the field QuickBooks returns on a read, and `#DuplicateBillProbe` queries for it alongside the vendor-and-document-number query. A create whose response was lost is therefore found by the next attempt and refused by name rather than repeated.

**The field is shared with the provenance stamp, and the marker leads.** `AC-KIT-012.23` through `.25` put identity, grant kind and reason into the same field, and `AC-KIT-008.40` requires the marker to stay exactly matchable when they do. The composition rule is therefore fixed here: the field begins with the marker token and no other text, the provenance segment follows a single stable delimiter, and the marker token contains no character used as that delimiter. **Which query operator matches it is not decided here and must not be assumed** — whether the carrying field is filterable at all is unsourced (`@REQ-KIT-008` Open Question 1, renumbered from Open Question 3 in Revision 4), and the Work Order confirms it against the Intuit API reference before implementing the probe. A prefix-matchable marker is the composition most likely to survive that answer; if no operator matches it, the marker is still written as readable provenance and duplicate detection falls back to the vendor-plus-document-number probe and Cargo's attempt log, neither of which depends on the unsourced capability. A query error is never read as an absence (`AC-KIT-008.31`).

`CreateBillPayload.docNumber` is **not nullable**. An invoice with no printed number refuses at payload construction (`AC-KIT-008.26`), and the consumer must supply one deliberately — Cargo's `po_invoice` already keys identity on `coalesce(doc_number, file_name)` (`0024_po_invoice.sql`), which is the value to use. Silently skipping the probe is not an option the package offers.

**Consequences:** The duplicate gate now works for unnumbered invoices and survives a retry, which is what makes a button on a serverless function safe. We now write a Cargo/Ledger-internal identifier *and* a provenance stamp into a QuickBooks field a human reads, which is real pollution of the books and must be formatted so an accountant can ignore it. The probe costs a second query per post, and the field's format is now load-bearing for two guarantees at once — a change to it is a `#GateContractVersion` bump. Recovery after a create-transport failure is defined rather than absent: report existence unknown, return the marker, and find the bill by marker on the next attempt.

**How we would know this is wrong:** two bills in QuickBooks carrying the same `PlanId`. A `po_invoice` row with two QuickBooks bills against it. A probe returning "no bill" on a query the API rejected. Or an operator reporting that the composite field makes a bill unreadable in the QuickBooks UI.

### ADR-006: The freshness re-check inside the lock is the package's obligation, not a driver criterion

**Context:** `AC-KIT-009.3` requires only that every exchange happen *inside* the locked operation. Two processes serializing perfectly through a correct lock both satisfy it and both exchange: the first spends the refresh token, the second exchanges a token Intuit has already rotated. The property that actually prevents the failure is Ledger's re-evaluation of `isExpired(current, now)` against the record read **under** the lock, returning `{ record: null, refreshed: false }` without exchanging (`oauth.ts:199-202`). Revision 1 of the Requirement assigned "exactly one refresh exchange" to `#CustodyConformanceSuite` as a *driver* grade, but a driver has no control over whether the package re-checks freshness — so a flawless `pg_advisory_xact_lock` driver would be failed while the package defect stayed unnamed.

**Options considered:** (a) leave it as a driver criterion and let the suite catch it wherever it surfaces — mis-assigns a package bug to every driver author and makes the suite unusable as an adoption gate; (b) make it a package contract and have the suite grade drivers only on mutual exclusion and tenant scoping — correct assignment, but leaves "exactly one exchange" untested unless the package has its own test; (c) both — package contract, package test with a stub driver counting exchanges, and a suite that grades drivers on lock semantics alone.

**Decision:** (c), and Revision 2 of `@REQ-KIT-008` cut it into criteria. `#LockedTokenRefresher` re-evaluates freshness against the record read inside the lock and returns it unexchanged when valid (`AC-KIT-009.17`); the package ships the two-sequential-locked-operations test that fails unless exactly one exchange occurred (`AC-KIT-009.18`). `#CustodyConformanceSuite` grades a driver on mutual exclusion across processes (`AC-KIT-009.5`, `AC-KIT-009.6`, `AC-KIT-009.7`), on tenant scoping (`AC-KIT-009.20`), and on releasing a lock when its holder exits (`AC-KIT-009.28`) — and `AC-KIT-009.21` forbids it from grading exchange count at all.

**Consequences:** A driver author can pass the suite by writing a correct lock, which is what the suite is for. The exchange-count property is tested once, in the package, where the code that determines it lives. The Requirement defect this ADR opened is closed: `AC-KIT-009.6` now reads as mutual exclusion, and the criterion this Blueprint originally described under that id no longer exists at that id.

**How we would know this is wrong:** a driver passing the suite and still producing two exchanges, which would mean mutual exclusion and freshness together are not sufficient and a third property is missing.

### ADR-007: The per-line `ClassRef` gate crosses with the rest, and no gate has a caller-supplied opt-out

**Context:** `applyVendorBill` runs five gates, not four: `assertPerLineClassRefSupported` (`vendor-bill.ts:1056`, defined `:630-658`) refuses when the adapter that would receive the create does not accept a `ClassRef` on every line, or when its capability declaration carries no measurement date. The mapping requires every line to carry a class (`vendor-registry.json` `brandClasses`), and brand-level P&L is the reason it exists. Separately, `AC-KIT-008.2` forbids a caller-supplied grant set but nothing forbade a caller-supplied flag disabling a gate — and `recheckDuplicate` (`vendor-bill.ts:1005,1065`) is exactly that, a legal bypass a faithful extraction would carry across.

**Options considered:** (a) drop the gate as Ledger-specific adapter plumbing — Cargo posts against the self-hosted REST path, which accepts per-line class by construction, so it would "work"; it would also mean an adapter change silently unclasses every line and nothing refuses; (b) keep the gate but let the consumer pass the capability declaration, defaulting to permissive when absent — a default that permits is how an unmeasured claim becomes a capability, which `@blueprint:quickbooks-connector` ADR-002 already refused; (c) keep the gate, require the declaration, and ship no opt-out on any gate.

**Decision:** (c). `#PerLineClassRefGate` is the fifth pre-write gate and runs with the others (`AC-KIT-008.20`, `AC-KIT-008.21`, enumerated in the re-cut `AC-KIT-008.19`). The capability declaration is a required argument, and a declaration with a null measurement date refuses — an unmeasured claim is not a capability. No gate accepts a caller-supplied flag that disables it (`AC-KIT-008.22`); `recheckDuplicate` does not cross the boundary.

**Revision 3 adds the export-side control the gate should never have been alone in providing.** `AC-KIT-010.20` forbids the package from exporting any adapter that cannot carry a class reference on every bill line, so the adapter that would fail `#PerLineClassRefGate` is not a thing a consumer can be handed in the first place. This is not belt-and-braces: a runtime refusal fires when someone has already wired the wrong adapter into a money path, and the export rule means that wiring does not compile. Which adapter that leaves is ADR-014.

**Consequences:** A bill cannot post unclassed, so brand P&L cannot be quietly wrong for a bill nobody flagged. Cargo must supply a capability declaration for its adapter, which means Cargo carries a measured record rather than an assumption. The cost is one more required argument and no escape hatch when an operator "just needs it to post" — deliberate: an escape hatch on a money gate is the gate's failure mode, not its feature.

**How we would know this is wrong:** a legitimate post blocked by a declaration that is merely stale rather than negative, often enough that operators route around Cargo.

### ADR-008: Version skew is caught by an exported gate-contract constant, not only by drift review

**Context:** `AC-KIT-011.14` was declared in Revision 1 as a deliberate defect: it reduced to "an entry exists in the drift log", which is process, not a gate. The reasoning was that the only machine-checkable form of "both consumers pin the same version" is a test in one repository asserting another repository's contents, which CLAUDE.md forbids (the `COV_PAVER_146` precedent). That reasoning holds for *pin equality* and not for *behaviour equality*.

**Options considered:** (a) accept the process-only control and rely on weekly drift review — the skew is real and the review is human; (b) a cross-repo assertion — forbidden, and it would break the other repository's build for its own normal work; (c) the package exports `GATE_CONTRACT_VERSION`, and each consumer's own in-repo test asserts the value it was built against.

**Decision:** (c), alongside (a) rather than instead of it. `#GateContractVersion` increments whenever any gate named in `@REQ-KIT-008` changes behaviour (`AC-KIT-011.14`) and whenever the grant table gains a write method for any identity (`AC-KIT-012.11`). Ledger's test asserts its value (`AC-KIT-011.21`) and Cargo's asserts its own (`AC-KIT-011.27`) — two criteria since Revision 3, so exactly one Work Order claims each — each reading nothing outside its own repository. The drift-log entry stays (`AC-KIT-011.22`), because a red build tells you *that* something changed and the log tells you *what*.

**Consequences:** Skew becomes a failing gate rather than a note in a review nobody blocked on. The cost is a hand-maintained integer — a gate change that forgets to bump it defeats the mechanism, so bumping it belongs in the same commit as the gate change and in the package's own release checklist.

**How we would know this is wrong:** a gate change shipping without a bump, found by a defect rather than by a red test.

### ADR-009: `src/qb/contract.ts` crosses whole, and the package exports the guarded contract rather than the raw one

**Context:** Four documents answered the builder's first question four ways. `WO-KIT-001`'s In Scope table moves `src/qb/contract.ts` across as "already pure"; its added-AC 2 argued `AC-KIT-012.3` was implementable as "exactly one" on the premise that `createJournalEntry` is not on the package's exposed write set — but `contract.ts:312` declares it and `:334` lists it in `CONTRACT_METHODS`, so moving the file moves the method. Underneath that sits a harder problem: `AC-KIT-011.2` deletes `creation-policy.ts`, `approval-gate.ts`, `write-verifier.ts` **and** `guarded.ts` from Ledger, while `reconcile` (`reconcile.ts:972`) and `expense-review` (`apply-review.ts:56`) dispatch non-create writes through `GuardedContract`, which composes the first three (`guarded.ts:4-6`). Deleting them without a replacement leaves two money-touching workflows with no approval check and no post-write verification.

**Options considered:**

| Option | Real trade-off |
|---|---|
| Trim `contract.ts` to the exposed write set and ship only the bill gate chain | Smallest package surface, and `createJournalEntry` never appears in it. But `updateBill`, `updateBillPayment`, `updatePurchase`, the searches and the reports namespace are exactly what `reconcile` and `expense-review` write and read through, so a trimmed contract cannot carry their guards — which forces Ledger to keep local copies of the approval hash and the write verifier. That is the drift this package exists to end, relocated. |
| Export the approval-hash and write-verify functions standalone, for Ledger to compose itself | Ships the smaller surface *and* keeps one implementation of each function. But it is a second way to write: a caller holding `verifyWrite` holds a gate it can forget to call, and the package would then export a path that dispatches a write without a capability token — which `AC-KIT-008.39` forbids. |
| Move `contract.ts` whole and export the composed **guarded** contract; keep the raw contract internal | One implementation of every gate, one surface for both consumers, and no ungated path out of the package. Costs a larger public type surface and puts `createJournalEntry` and `updateJournalEntry` on the exposed write set, granted to nobody. |

**Decision:** Option three. `src/qb/contract.ts` crosses **whole**. The package exports `#GuardedWriteDispatcher` — approved-change dispatch plus post-write re-read, every write method behind a capability token (`AC-KIT-008.35`, `AC-KIT-008.36`, `AC-KIT-008.37`, `AC-KIT-008.38`, `AC-KIT-008.42`) — and exports **no path that dispatches a write without a token** (`AC-KIT-008.39`). The raw contract and the adapter router stay internal to the package's write path; reads remain unguarded, as they are in `guarded.ts:42-49`, because reading changes nothing.

Ledger's non-create workflows become consumer workflow identities in the package's table holding **normal grants of the update methods they dispatch** — `updateBill`, `updateBillPayment`, `updatePurchase` (`AC-KIT-012.29`, `.31`, `.32`). Revision 2 of this ADR said "empty create-grant sets"; that is withdrawn at ADR-003, and it matters here more than anywhere else in the file, because this is the decision that put those workflows behind the gate. Under `AC-KIT-008.44` an empty set refuses every write, so the sentence that solved the drift would have broken `reconcile` and `expense-review` outright. Ledger keeps nothing local: no grant table (`AC-KIT-011.24`), no hash recomputation (`AC-KIT-011.25`), and every QuickBooks write dispatched through the package (`AC-KIT-011.23`).

**Consequence for the partition:** `createJournalEntry` and `updateJournalEntry` **are** on the package's exposed write set and are granted to nobody, deliberately (`creation-policy.ts:35-39` — "a journal entry is a correction instrument … If a reclassification genuinely needs one, that is a Requirements change, not a token grant"). An invariant reading "exactly one consumer system per write method" would therefore fail a correct table, and the test would then be weakened to pass — which is how an invariant becomes decoration. `AC-KIT-012.3` is "no more than one", `AC-KIT-012.28` makes an ungranted-but-declared method explicitly legal, and `WO-KIT-001`'s added-AC 2 reasons from a premise this decision falsifies and must be withdrawn (Foreman, F1).

**Consequences:** One implementation of every gate serves both products and all thirteen workflow identities, and the "exports no raw contract surface" line this Blueprint carried in Revision 1 is re-cut to "no **ungated** contract surface", which is `AC-KIT-008.39`. The package's public type surface grows to the whole contract, so a contract change is a package release both consumers must take — the same coupling ADR-003 accepts for the grant table, for the same reason. Revision 2 of this ADR said Ledger's adapters do **not** cross. That is re-cut by **ADR-014**, on measurement: `#SelfHostedAdapter` and its REST client cross with the contract, because Cargo cannot post without an adapter and writing a second one is the drift this ADR just spent three options avoiding; `#HostedAdapter` and the subprocess connector stay in Ledger and are injected there. The package stays transport-agnostic in the way that matters — the HTTP call is an injected function, which `rest-client.ts:37,47,52` already takes as `fetchImpl` — and Ledger keeps the routing decision `@blueprint:quickbooks-connector` ADR-004 owns.

**How we would know this is wrong:** a Ledger source file recomputing a plan hash or comparing a retrieved total against an approved one after adoption (`AC-KIT-011.17`, `AC-KIT-011.25` are the tests). An exported symbol found dispatching a write without a token. Or a consumer importing the raw contract type to build its own dispatcher, which would mean the guarded surface is missing a method someone needed.

### ADR-010: The shared Postgres custody driver ships from `@paver/qb`, over one production connection route

**Context:** Both consumers lock the same `qb_token` row (ADR-002). The driver that takes that lock was being built inside Cargo's repository, which Ledger cannot import — separate repositories, and `AC-KIT-011.4` forbids a Ledger test from reading a file outside the Ledger repository. `WO-026` requires Ledger to lock the shared row "through Cargo's Postgres driver" and lists `WO-KIT-001` alone as its blocker, so the dependency it actually has has no home. Two drivers over one rotating token is the failure ADR-001 exists to prevent, reintroduced by repository layout.

**Options considered:**

| Option | Real trade-off |
|---|---|
| The driver lives in Cargo; Ledger writes its own against the same schema | No new package surface, and each repository owns its own dependencies. But it is two implementations of one lock protocol over one row — the drift, in the layer where drift costs the whole connection rather than one bill. Two drivers also means two conformance grades, and nothing forces them to agree. |
| A second kit package, `@paver/qb-postgres`, depending on `@paver/qb` | Keeps `@paver/qb` free of any database concern and lets the driver version independently. Costs a second git tag both consumers must pin, a second version to skew, and a `#GateContractVersion` that no longer covers the lock — so a lock fix could reach one consumer and not the other, which is the skew ADR-008 exists to catch, reintroduced one layer down. |
| A separate entry point of `@paver/qb` (`@paver/qb/postgres`) exporting a driver that takes an injected queryable | One tag, one version, one grade; the lock protocol travels with the gates it protects. `AC-KIT-010.6` forbids a filesystem-backed driver, not a database one, and `AC-KIT-010.12` forbids depending on another `@paver/*` package, not on nothing. Costs a third public entry point `#ServerlessSurfaceGuard` must walk, and requires the driver to import no database library — otherwise `pg`'s own transitive graph decides whether `AC-KIT-010.1`–`.3` hold. |

**Decision:** Option three. `#PostgresAdvisoryLockTokenDriver` ships from `@paver/qb/postgres` and receives a `Queryable` — a handle with `query` and `transaction` — from the consumer. It imports no database library, so the entry point's import graph stays clean under `AC-KIT-010.4`, and the connection, pool sizing and credential handling stay with the runtime that opens the socket. Cargo passes a pooled client from its route; Ledger passes one from its CLI.

**One production route, so one grade means something.** Both consumers connect through the Supabase shared **transaction** pooler for this project — `aws-1-us-west-2.pooler.supabase.com:6543`, user `postgres.ezzfbtqcdyxxilpumzkw` (ADR-002 records the measurement and the `aws-0`/`aws-1` trap). Ledger uses the pooler too, rather than the IPv6-only direct host that also works from a Mac, because `AC-KIT-009.29` grades a driver over the route the consumer uses in production and two routes would mean two grades — one of which nobody runs. Transaction mode carries two obligations the driver must satisfy and the suite must catch: prepared statements are disabled, and only transaction-scoped locks are taken (`AC-KIT-009.28` fails a lock that survives its holder's exit, which is what a session-scoped lock on a multiplexed backend looks like).

**Consequences:** The cross-process guarantee is provable across *both* systems, because the lock lives in Postgres and the implementation taking it is one artifact pinned by one tag. `WO-026`'s missing dependency resolves to `WO-KIT-001` — the driver ships with the package — rather than to a Cargo work order Ledger cannot consume; the ordering consequence is Foreman's (F3). Both consumers now carry a Postgres client dependency they did not have (`pg` is absent from both `package.json` files today) and a connection budget: a lock held across an exchange holds a pooled connection, which is why `AC-KIT-009.22` keeps the common path out of the lock entirely. The package gains a third public entry point, and the conformance suite becomes a build-time gate in **each** consumer rather than a promise in the package.

**How we would know this is wrong:** a consumer discovered running the suite against a stub or against a direct connection while deploying over the pooler. A second driver appearing in either repository. `pg` or another database library appearing in `@paver/qb`'s dependency list. Or a lock acquired by a process that has already exited, which is `AC-KIT-009.28` catching a session-scoped lock that reached production.

### ADR-011: Break-glass is a second grant kind on a separate entry point, and every create is stamped

**Context:** Revision 1 of this decision set removed Ledger's `createBill` grant entirely at cutover, on the reasoning that two systems granted one create method is what the partition forbids. The operator has decided against the hard cut (decision D1, 2026-08-14): Ledger keeps a bill path for the cutover window, for the day Cargo is unavailable, and for a bill that must exist outside a purchase order. An exception that is merely tolerated makes the partition decorative — if both systems can write `Bill` and nothing records which one did, the table is documentation.

**Options considered:**

| Option | Real trade-off |
|---|---|
| One grant kind; Ledger simply keeps `createBill` alongside Cargo | Zero mechanism, and the invariant collapses to "one or two writers, whichever". Nothing in the table distinguishes the routine writer from the emergency one, and nothing stops a Ledger code path from becoming the routine writer by drift. |
| No Ledger grant; the break-glass path is the QuickBooks UI plus Cargo's adoption screen | The Revision 1 answer. It needs no deploy, no token and no grant to be correct on the day it is used. Rejected by the operator: it is not a path for a bill that has no PO in Cargo, and it leaves the cutover window with no programmatic writer at all. |
| A declared second grant **kind**, on a separate entry point, requiring a reason, stamped into the record | Keeps one *normal* writer per entity while making the exception explicit, unreachable by accident, and visible after the fact. Costs a second entry point, a required argument, a stamp in a field an accountant reads, and a partition rule with two clauses instead of one. |

**Decision:** Option three, in four parts.

1. **Declared, not incidental.** Each grant records its kind (`AC-KIT-012.17`). `cargo-factory-bill` holds `createBill` **normal**; `ledger-vendor-bill` holds `createBill` **break-glass** (`AC-KIT-012.5`, `AC-KIT-012.7`). The partition rule has three clauses, stated over **write** methods: at most one system normal-granted per write method, at most one system break-glass-granted per write method, and no system holding both kinds for one write method (`AC-KIT-012.3`, `AC-KIT-012.16`, `AC-KIT-012.18`). Break-glass and the stamp remain **create-shaped**: a non-create break-glass has no case today, and `AC-KIT-012.30` says explicitly that a non-create write does not touch the provenance field rather than leaving that silent.
2. **Distinguishable in the table, and in the type.** `GrantKind` is a field on the grant, not a naming convention, so `#GrantPartitionChecker` reads it rather than parsing it and a mislabelled grant is a compile error rather than a typo.
3. **Not reachable by accident.** The break-glass path is exported from an entry point the default entry point does not re-export (`AC-KIT-012.19`, `AC-KIT-012.20`), takes the reason as a required argument and refuses when it is absent or empty (`AC-KIT-012.21`, `AC-KIT-012.22`), and is invoked by **no module inside the package** — so no refusal on the normal path can fall back to it (`AC-KIT-012.27`). Cargo asserts in its own repository that no Cargo file imports it (`AC-KIT-011.26`).
4. **Marked in the record, which is what makes the partition legible afterwards.** `#BillProvenanceStamper` writes the consumer workflow identity and the grant kind into every create, and the reason on a break-glass create (`AC-KIT-012.23` through `.25`); `#PostWriteBillVerifier` reports a fetched bill carrying no identity as not verified (`AC-KIT-012.26`). Afterwards a bill sorts into exactly one of three buckets: *Cargo, normal*; *Ledger, break-glass, for this reason*; or *stamped by neither, therefore not created through `@paver/qb`* — the QuickBooks-UI path.

**Attribution is advisory, and that is now decided rather than pending.** Operator decision D4 (2026-08-14) accepts advisory provenance and **rejects** two-application attribution; `@REQ-KIT-008` Closed Question 4 records it. The stamp is a value the package writes, so it attests to what the package did, not to what QuickBooks observed; and under ADR-002 both consumers authenticate as one Intuit application, so the platform's own audit trail names the application and cannot separate them. Absence of a stamp is informative — the bill was not created through this package — but cannot be distinguished from a stamp removed later. The reasoning on the record for accepting that: the only failure real attribution would catch is a compromised consumer, and a compromised consumer holding the grant writes a truthful stamp anyway. `AC-KIT-012.30` closes the one way the package itself could have degraded the stamp — a later update overwriting the creating system's mark.

**Consequences:** The partition survives an exception without being hollowed out by it, and "which system created this bill" is answerable from the bill. The costs are real and permanent: two deployables can now create a `Bill` at any instant, so the number of things that can be wrong is two rather than one; the stamp is more text in a field an accountant reads, sharing that field with the idempotency marker under ADR-005's composition rule; and the break-glass path must be exercised occasionally or it will be broken on the day it is needed. Cutover no longer requires an atomic grant move — both grants exist from the package's first release — which removes the window `@blueprint:cargo-container-blueprint` ADR-018 previously had to sequence around.

**How we would know this is wrong:** a bill in QuickBooks whose stamped field names no identity. A break-glass create whose reason is a placeholder like "n/a", which would mean the required argument became a formality. Ledger's break-glass path used routinely rather than exceptionally, which would mean Cargo's button is not trusted. Or a module inside the package found importing the break-glass entry point.

### ADR-012: The partition is a function over a supplied grant table, so adding an entity is a data change

**Context:** Revision 1's `AC-KIT-012.6` read "the grant table shall grant no create method other than `createBill` to any Cargo identity" — an absolute that froze the current assignment. Cargo is the SKU master and will create QuickBooks Inventory Items later (operator correction D2), which would have made Cargo's next entity a violation of a shipped Acceptance Criterion and invited the test to be weakened rather than the design extended. A partition check hard-coded to `createBill` has the same defect one layer down: it passes today and fails to constrain anything tomorrow.

**Options considered:** (a) keep the absolute and re-cut it each time an entity is added — every entity becomes an AC change and a re-argument of the partition; (b) drop the check to a hand-maintained document and rely on review — the invariant becomes prose, which is what this whole chain exists to stop; (c) express the check as a pure function over a grant table supplied to it, and prove the function is not hard-coded by applying it to a fixture table carrying a method the shipped table does not have.

**Decision:** (c). `#GrantPartitionChecker` takes a `GrantTable` as an argument (`AC-KIT-012.13`) and returns violations. Three shipped tests use it: against the shipped table, which must report none (`AC-KIT-012.4`); against a fixture granting a **write** method **absent from the shipped table** to identities of one system, which must also report none (`AC-KIT-012.14`); and against a fixture normal-granting one write method to identities of two systems, which must report a violation (`AC-KIT-012.15`). A checker written against `createBill` passes the first and third and fails the second, which is the point of the second.

Adding a write method to an identity's grant set must therefore leave the `AC-KIT-012.4` test passing **without modification** (`AC-KIT-012.6`), provided the three partition clauses still hold. The cost of entry for a new entity is then: the method joins the declared exposed write set (`AC-KIT-012.10`), an identity gains it in the table, `#GateContractVersion` increments (`AC-KIT-012.11`), and both consumers' in-repo assertions go red until reviewed. That is a declared capability change, not a re-architecture.

**Revision 4's widening does not narrow that path, and I checked rather than assumed.** `createItem` is a write method no other system holds, so granting it to a new Cargo identity leaves `AC-KIT-012.3`, `.16` and `.18` holding, leaves `AC-KIT-012.4`'s test passing unmodified, and leaves `AC-KIT-012.14`'s fixture untouched — the fixture's requirement is that its method be *absent from the shipped table*, which was never a create-specific property. The one constraint Cargo does acquire from the widening is that it may not take a **normal** grant of `updateBill`, `updateBillPayment` or `updatePurchase`, because Ledger holds those (`AC-KIT-012.29`, `.31`, `.32`). That is the partition working over the write surface, not a limit on Cargo's own entities — operator decision D2 survives intact.

**This ADR does not specify the Item work.** No Requirement authorizes Cargo to create QuickBooks items, `createItem` is not on the contract today, and Boris does not design capability without an authority chain. The fields, the SKU-to-item mapping and the workflow identity that would hold the grant belong to their own Requirement → Blueprint → Work Order chain. What is decided here is only the shape of the change that adds it.

**Consequences:** The invariant is enforced by a function whose extensibility is itself falsifiable, so the next entity is a table edit and a version bump rather than an argument. The cost is one more exported function and three tests where one would have looked sufficient, and a fixture that must be maintained to keep carrying a method the shipped table does not — the moment `createItem` is really granted, `AC-KIT-012.14`'s fixture must move to a different absent method or the test silently stops proving anything. Stating the partition over write methods rather than entity types raises that maintenance slightly, because the pool of absent methods is now the whole write surface rather than the create surface.

**How we would know this is wrong:** the `AC-KIT-012.14` fixture found using a method the shipped table now carries. A grant change that required editing the partition test. A partition clause found stated over entity types anywhere in the chain, which would mean the coarser rule regrew. Or a violation reported by review rather than by the function, which would mean a clause of the partition is not expressed in it.

### ADR-013: Authorization is one membership test over the token's grant set, with no branch on method kind

**Context:** ADR-009 exported the whole guarded contract to both consumers so Ledger's `reconcile` and `expense-review` would keep their gates. It did not widen the authorization vocabulary to match, and Revision 2 of this Blueprint recorded the result faithfully: `#GuardedWriteDispatcher`'s responsibilities listed a refusal for an ungranted **create** (`AC-KIT-008.37`) and listed nothing for an update. The code that idiom was lifted from says why. `assertMayCreate` opens with `if (!isCreation(method)) return;` (`creation-policy.ts:80-85`), and `WRITE_METHODS` holds six methods against `CREATION_METHODS`' two (`method-groups.ts:56-70`) — so `updateBill`, `updateBillPayment`, `updatePurchase` and `updateJournalEntry` were unauthorized by construction, and both authorization call sites are that one function (`guarded.ts:53-56,72-78`). In one trusted local CLI process that was a defensible reading of "creation policy": the process boundary was the authorization boundary and the only question worth asking was "may this workflow create". Put a second product's serverless identity in the same table and `cargo-factory-bill`, whose grant set is exactly `['createBill']`, holds a token that satisfies every gate on `updateBill` and nothing refuses it.

**Options considered:**

| Option | Real trade-off |
|---|---|
| Add a non-create clause to the existing create refusal and one negative AC on Cargo | Smallest diff, and it leaves two vocabularies in one table: a create-rule block and a non-create-rule block, with a future author of a new write method having to know which one to extend. That is the two-copies-of-the-rules failure this package exists to end, relocated into the authorization layer. |
| Keep the create/non-create split but make the non-create side a separate gate component | Two nodes, two tests, two places for a method to be forgotten — and the forgetting is silent, because a method absent from both gates dispatches. |
| One membership test over one grant set, applied to every write method, held by one node | One vocabulary, one test, one place to read. Costs the loss of a cheap structural guarantee — "no non-create can ever create" was free when the two sets were separate types — which must now be carried by the table's contents rather than by the type system. |

**Decision:** Option three. `#GrantSetMembershipGate` decides authorization by membership alone (`AC-KIT-008.44`); `#BillCreationGateChain` and `#GuardedWriteDispatcher` both call it and neither holds a branch; an ungranted create and an ungranted non-create write refuse identically (`AC-KIT-008.37`, `AC-KIT-008.43`); the gate is asserted on every exposed write method (`AC-KIT-012.8`) and a shipped test invokes each exported write path with a token that does not grant it (`AC-KIT-012.9`). There is deliberately **no `CreateMethod` type** in the package's public vocabulary — `WriteMethod` is the type, and creates are a subset of its values.

**The name goes with the semantics.** A component called "creation policy" that authorizes updates will re-teach the defect to the next reader, which is why the node here is named for the question it asks rather than for the half of the surface it used to ask it about, and why `@blueprint:quickbooks-connector`'s `#CreationPolicy` is renamed `#WriteGrantPolicy` in the same revision.

**What replaces the lost type-level guarantee.** The create/non-create distinction still exists where it earns its place: only creates carry a provenance stamp (`AC-KIT-012.23` through `.25`), and a non-create write must not modify that field (`AC-KIT-012.30`). Those are behaviours of `#BillProvenanceStamper` and `#GuardedWriteDispatcher`, not of the authorization check, which is the right home for them — the question "may you write this" and the question "what do you write into the record" are different questions and Revision 2 conflated them.

**Consequences:** One question, asked once, over one set. The partition becomes enforceable over the whole write surface rather than over half of it, which is what makes `@REQ-KIT-012`'s claim true rather than aspirational. The cost is that a mis-typed grant table entry can now hand a consumer a create it should not have, where previously the type system would have caught a create appearing in a non-create field — mitigated by `#GrantPartitionChecker` and by the table being a closed union in one file that a release must touch, and accepted because the failure the split caused was live and the failure it prevented was hypothetical.

**How we would know this is wrong:** any authorization code path that inspects whether a method creates. A write method reachable through an exported path that `AC-KIT-012.9`'s test does not enumerate. A grant table entry granting a create to an identity that only categorizes — the failure this option trades for, and the one to watch. Or a second authorization node appearing, which would mean the single membership test did not cover a case someone needed.

### ADR-014: The self-hosted REST adapter crosses into the package; the hosted and subprocess adapters cannot

**Context:** ADR-009 said Ledger's adapters do not cross, and left a question a builder hits on day one: Cargo cannot post without an adapter, and Cargo has none. The two answers are that Cargo writes its own or that one crosses — and the choice is not open, because it has already been made by measurement in two places. `config/tenants/madson/tenant.json:14` routes **every** method group at `self-hosted` and records the reason in the file: the WO-006 capability diff found the hosted path cannot carry a per-line `ClassRef` on an item-based line, so `billWrites` must stay self-hosted. Every Madson bill line carries a brand class (`vendor-registry.json` `brandClasses`, and `@blueprint:cargo-container-blueprint` ADR-019 item 3 forbids a default), so the hosted path was never viable for these bills. Separately, the hosted connector is configured as `kind: "stdio"` running `node .mcp/quickbooks-online-mcp-server/dist/index.js` (`tenant.json:16-19`) — a subprocess, which cannot run on a Vercel function at all — and `hosted.ts:1` imports `node:fs`, which `AC-KIT-010.1` forbids anywhere in the package's reachable graph.

**Options considered:**

| Option | Real trade-off |
|---|---|
| Cargo writes its own REST adapter against the same API | Keeps the package free of transport code. But it is two implementations of the QuickBooks request shape — line details, `ClassRef` placement, minor version, query escaping — under two teams, which is the drift this package exists to end, one layer below the gates. The gates would be shared and the bytes would not. |
| The package defines only an adapter *interface*, and both consumers inject one | Honest layering, and it is what `AC-KIT-010.10` does for the HTTP call. Applied to the whole adapter it means the same two implementations as option one, with an interface making them look coordinated. |
| `#SelfHostedAdapter` and its REST client cross with the contract; `#HostedAdapter` and the subprocess connector stay in Ledger and are injected there | One request shape for both products, and the crossing artifacts are the two already proven serverless-clean. Costs the package a transport dependency it wanted to avoid, and moves Ledger's most-changed file into a release cycle. |

**Decision:** Option three. `#SelfHostedAdapter` and `rest-client.ts` cross into the package alongside `contract.ts` (ADR-009). They are the correct pair to move and the others are not, on properties I read rather than inferred: `rest-client.ts` already takes its HTTP call as an injected `fetchImpl` (`rest-client.ts:37,47,52`), which is `AC-KIT-010.10` satisfied by construction; neither `self-hosted.ts` nor `rest-client.ts` reaches `node:fs`, `node:path` or `node:child_process`; `hosted.ts:1` imports `node:fs` outright; and the MCP connector spawns a process. `AC-KIT-010.7` forbids exporting a subprocess adapter and `AC-KIT-010.20` forbids exporting one that cannot carry a per-line class — between them, the hosted and MCP paths are not exportable and the self-hosted path is the only one left.

**Cargo therefore has exactly one adapter and no routing decision to make.** Any text in this chain implying Cargo might reach QuickBooks through the hosted or MCP path is wrong. Ledger keeps `#AdapterRouter`, its `RoutingMap` and the hosted adapter for the groups it may later route there — a configuration edit, per `@blueprint:quickbooks-connector` ADR-004 — and injects the hosted adapter into the package rather than the package exporting it.

**One builder obligation this decision creates.** The crossing must be the REST client path specifically, and `#ServerlessSurfaceGuard`'s walk over the built output is the proof (`AC-KIT-010.4`) — not a reading of the source tree. Anything the moved files pull in transitively is now inside the package's import graph, so a dependency of theirs that reaches a filesystem module fails `AC-KIT-010.1` through `.3` and must be replaced rather than excused.

**Consequences:** One QuickBooks request shape serves both products, so a bug in line-detail construction is fixed once. The package grows a transport layer, which is a larger public surface and a bigger release to review. Ledger's adapter file becomes a package release rather than a local edit, which slows down exactly the file Ledger has historically iterated on — accepted, because that file now writes to the real books from two products. The hosted adapter stays where its measurement discipline lives (`@blueprint:quickbooks-connector` ADR-002), which also keeps `#CapabilityDiffer` out of the package.

**Revision 4 adds the clause that makes the exported adapter usable, and it is a defect in this ADR rather than in a Work Order.** `AC-KIT-008.21` refuses a create when the receiving adapter's capability declaration carries **no measurement date**, and ADR-007 states the reasoning plainly — an unmeasured claim is not a capability. The adapter this ADR exports declares `measuredAt: null` (`self-hosted.ts:316`, via `declareCapabilities`' `input.measuredAt ?? null` at `capabilities.ts:69`). Ledger does not hit the refusal because `assertPerLineClassRefSupported` only reads a declaration when one is *supplied for that adapter* and otherwise consults a `PER_LINE_CLASSREF_BY_CONSTRUCTION` set (`vendor-bill.ts:630-658`) — a by-construction exemption the package does not carry and must not acquire, because a by-construction exemption is how an unmeasured claim becomes a capability. **So: the adapter the package exports ships a capability declaration whose measurement date names a real measurement against the live API** — the same instrument `#CapabilityDiffer` applies to the hosted path, applied once to this one and recorded. Without that date the only exportable adapter refuses every create, which is the same failure shape as `AC-CARGO-018.40`'s missing item mapping and would have surfaced on the first production write. The Requirement half — an obligation that the exported adapter carry a dated declaration — has no criterion today and is routed to Karl.

**How we would know this is wrong:** a second REST client appearing in either repository. A Cargo route found injecting an adapter. `#ServerlessSurfaceGuard` failing on a transitive import the moved files brought with them, which would mean the crossing was measured at the wrong granularity. A `PER_LINE_CLASSREF_BY_CONSTRUCTION`-shaped exemption appearing inside the package. Or a request to route Ledger's `billWrites` at the hosted adapter, which would mean either the capability diff has changed or someone has stopped reading `tenant.json:14`.

### ADR-015: The package exports a guarded reference read, because the consumer that must verify a mapping identifier is forbidden from constructing the request

**Context:** Two criteria written in the same chain contradict each other. `AC-CARGO-018.48` obliges Cargo to read a mapping record's QuickBooks identifier **from QuickBooks** before saving the record, and `AC-CARGO-018.49` through `.52` build the whole mapping lifecycle on the result — the name QuickBooks returned, the date it was read, and a refusal to build a payload from a record that carries no such date. `AC-KIT-011.42` forbids **any** Cargo source file from constructing a request to the QuickBooks Accounting API, and `AC-KIT-011.41`/`.43` forbid Cargo defining or supplying an adapter. The package's exported surface today is the guarded write path; no criterion says it exports a read at all. `#QbChartVerifier` — renamed `#QbReferenceVerifier` in `@blueprint:cargo-container-blueprint` ADR-019 — therefore cannot do its job by any path the artifacts permit. This is not a gap a builder can route around: every permitted option is closed.

**Options considered:**

| Option | Real trade-off |
|---|---|
| Cargo reads QuickBooks directly from the mapping-edit route, and `AC-KIT-011.42` is re-cut to forbid only **write** requests | Needs nothing from the package and ships fastest. But it re-opens the hole `AC-KIT-011.41` through `.44` were written to close one revision ago: a second place that speaks the Accounting API, with its own authorization header, its own API version and its own query escaping — and the read path is exactly where such a thing starts, because "it's only a read" is the argument that gets it merged. The next request that needs one field the contract lacks is written beside it. |
| Verification reads a chart **snapshot** Cargo syncs on a schedule, so the mapping-edit route touches no QuickBooks and no token | The mapping surface works while QuickBooks is down, and there is no read on the interactive path. But it verifies an identifier against a copy rather than against QuickBooks: an account deleted or renamed since the sync verifies cleanly, and the date stored under `AC-CARGO-018.50` then means "when we last synced" rather than "when QuickBooks confirmed this identifier" — which is precisely the distinction `AC-CARGO-018.51` exists to hold. It also does not remove the token dependency; it moves it to a cron nobody watches. |
| Ledger verifies and writes Cargo's mapping rows from its CLI, where a token and an adapter already exist | No Cargo read, no new package export. But `AC-CARGO-018.45` through `.47` require Cargo to provide the surface, admin-only, enforced at the data layer — and this makes a laptop CLI the editor of Cargo's canonical table, giving that table a second writer in another repository. |
| The package exports a reference read, dispatched through the adapter it already exports and the transport already injected | One request shape for reads and writes, `AC-KIT-011.42` holds by construction rather than by discipline, and the identifier is resolved against QuickBooks itself at the moment it is typed. Costs a read namespace on the package's public surface, and makes the mapping-edit route a consumer of the shared token — so the verifier cannot ship before the custody driver. |

**Decision:** Option four. `#ReferenceIdentifierReader` is exported from the package's default entry point and resolves an account, class, item or vendor **by its QuickBooks identifier**, returning the name QuickBooks holds for that identifier or reporting that it resolved to nothing. Four properties fix it:

1. **By identifier, not by name.** The existing contract methods `searchAccounts`, `searchItems` and `searchVendors` are name-shaped searches and do **not** satisfy `AC-CARGO-018.48`: an account name on a transaction is fully qualified while a search returns the leaf, and leaf names collide ([[quickbooks-api-gotchas]]). ADR-019 item 1 of the Cargo blueprint already forbids deriving identity from a name; a verifier that searched by name would launder the very failure the mapping design exists to prevent. The read takes the identifier the admin typed and asks QuickBooks what it is.
2. **Four reference kinds, because four are needed.** Accounts, classes, items and vendors are all reference kinds a bill payload carries an identifier for (`AC-CARGO-018.32`). The contract today exposes no class read at all, so this is a real addition rather than a re-export.
3. **Ungated, and it stays that way.** No capability token is required. Reads are unguarded throughout this package (ADR-009), and adding a grant here would mean a grant table entry for a workflow that only looks things up — authorization theatre over an operation that changes nothing.
4. **The exact query or endpoint form is the Work Order's to confirm.** `rest-client.ts:130` interpolates filters into `SELECT * FROM <Entity> WHERE <field> = '<value>'`; whether a by-identifier resolution is expressed that way or through a read-by-id endpoint is an API-shape question, and CLAUDE.md's spec-first rule says the builder confirms it against the Intuit reference rather than this Blueprint asserting it. What is decided here is the semantics — identifier in, name-or-nothing out — not the wire form.

**Where the token comes from, which is the ordering consequence.** The read authenticates through `#LockedTokenRefresher` on the same tenant key as a write, against the same `qb_token` row, through the same `#PostgresAdvisoryLockTokenDriver`. There is no second credential and no unauthenticated path. **So the mapping-edit surface depends on the custody driver being wired**, and a Work Order that ships `#QbReferenceVerifier` before one that ships custody ships a screen that cannot save a row. That ordering belongs in `blocked-by`, not in this prose — Foreman's, and it is the same shape as `WO-026`'s dependency on `WO-CARGO-023`.

**Consequences:** The mapping lifecycle becomes implementable, and the identifier an operator types is confirmed by QuickBooks rather than by Cargo. `AC-KIT-011.42` survives intact — it is a stronger negative than it looks, and it is only affordable because the package now exports the read it forces every consumer to route through. The costs are real: the package's public surface grows a read namespace, so a change to it is a `#GateContractVersion` question; the mapping-edit route acquires a QuickBooks dependency, so a vendor cannot be onboarded while the connection is down (already stated at Cargo ADR-019's consequences, now with a mechanism behind it); and a mapping edit can contend for the token lock, though only on the rare stale path `AC-KIT-009.22` does not short-circuit. **Karl owes one criterion**: the package shall export a read that resolves a QuickBooks account, class, item or vendor by identifier and returns the name QuickBooks holds for it — and `AC-CARGO-018.48` re-cut to perform that read **through the package** rather than unqualified.

**How we would know this is wrong:** a Cargo source file found constructing an Accounting API request — the negative this decision exists to keep affordable. A mapping row saved after a verification that searched by name. `verified_at` dates that all share one timestamp, which would mean a snapshot got built anyway. A capability token appearing on the read path. Or an operator blocked from onboarding a vendor often enough that someone proposes a cache, which would mean the interactive read is the wrong place for the verification even though the alternatives are worse.

### ADR-016: The adapter's interface and the group dispatch cross with it; the routing map and the measurement stay in Ledger

**Context:** ADR-014 moved `#SelfHostedAdapter` and `rest-client.ts` into the package and `@blueprint:quickbooks-connector` ADR-008 named the files that stay. Measured 2026-08-14, that instruction is not yet coherent: `self-hosted.ts:22-24` imports `declareCapabilities` and `AdapterCapabilities` from `../capabilities.js` and the `Adapter` type from `../router.js`, and both of those files are on the stay-in-Ledger list. `AC-KIT-010.21` requires the adapter to be exported and `AC-KIT-010.24` puts everything it imports inside the built-graph walk of `AC-KIT-010.4`, so either those symbols cross with it or the adapter is re-cut against symbols the package defines. Routed as **R13** in `@REQ-KIT-008` Revision 5, correctly, as a Blueprint question rather than a Requirements one. Underneath sits a second fact that decides it: `AC-KIT-010.25` obliges the package to accept a caller-supplied adapter **for a method group**, which is a per-group dispatch inside the package — so the package needs an `Adapter` type and a group resolution whether or not Ledger's file moves.

**Options considered:**

| Option | Real trade-off |
|---|---|
| `capabilities.ts` and `router.ts` cross whole | The adapter compiles unchanged and nothing is re-cut. But `router.ts` carries the tenant `RoutingMap` and `#AdapterRouter`'s selection policy, and ADR-004 of the connector gives Ledger that decision deliberately; and `capabilities.ts` carries `CapabilityUnavailable` and the declaration shape that `#CapabilityDiffer` produces from a live measurement, which is Ledger's discipline (connector ADR-002). Moving them takes Ledger's routing choice and its measurement posture into a package release. |
| The adapter is re-cut to import nothing from Ledger — its capability declaration inlined as a package-local literal | Smallest crossing. But then the package and Ledger declare capabilities two different ways, `#PerLineClassRefGate` reads one shape while `#CapabilityDiffer` writes another, and the hosted adapter Ledger injects under `AC-KIT-010.25` has to be adapted at the boundary. Two vocabularies for "what can this adapter do" is the failure ADR-013 just spent a revision removing from authorization. |
| The **type surface** and the **group dispatch** cross; the routing **map**, the capability **measurement** and `#HostedAdapter` stay | The package owns exactly what `AC-KIT-010.25` forces it to own — an adapter interface it can accept an injection against, a capability declaration it can read, and a group resolution — and Ledger keeps exactly what ADR-004 and ADR-002 of the connector give it. Costs Ledger a shrunken `router.ts` and a re-point of its imports, and it means `CapabilityUnavailable` is raised by the package rather than by Ledger. |

**Decision:** Option three, drawn on one line: **the package owns the adapter's contract; Ledger owns the choice of adapter and the evidence behind it.**

- **Crossing into `@paver/qb`:** the `Adapter` interface, `AdapterCapabilities`, `AdapterName`, `declareCapabilities`, `unsupportedMethods`, `CapabilityUnavailable`, and the method-group resolution `#AdapterGroupDispatcher` performs. These are the shape `AC-KIT-010.25`'s injection point is expressed in; a package that accepts a caller-supplied adapter without declaring what an adapter is has not accepted anything.
- **Staying in Ledger:** the `RoutingMap` value and the tenant-config loader that produces it, `#CapabilityDiffer` and its recorded `CapabilityDiffReport`, `#HostedAdapter`, and `mcp-stdio-client.ts`. Ledger supplies its map and its injected adapter to the package; the package resolves and dispatches.
- **`#AdapterRouter` is not deleted, it is reduced.** What remains in Ledger is the configuration read and the map it produces. The resolution, the capability check and the `CapabilityUnavailable` throw move, because they are the half that has to run in Cargo's process too and Cargo has no tenant config.
- **Cargo supplies no map.** With one exported adapter and no injection, every group resolves to `#SelfHostedRestAdapter` by default — which is what makes `AC-KIT-011.43`'s "no Cargo source file supplies a QuickBooks adapter" a description of Cargo's code rather than a rule Cargo must remember.

**Consequences:** `AC-KIT-010.4`'s walk over the built output covers a graph with no Ledger imports left in it, which is the property R13 was really about — a crossing that leaves a dangling import fails that walk loudly, and this decision means it does not have to. Ledger's `router.ts` shrinks to configuration, so a Ledger contributor who wants to change *how* resolution works now needs a package release; changing *what* a group routes to stays a config edit, which is the split ADR-004 of the connector actually cares about. `#CapabilityDiffer` staying in Ledger means the package's `#PerLineClassRefGate` consumes a declaration produced in another repository for the injected adapter and produced in-package for the exported one — two producers, one shape, which is acceptable only because the shape itself crossed. The connector blueprint's `#AdapterRouter` and `#SelfHostedAdapter` blocks are re-cut in the same revision.

**How we would know this is wrong:** `#ServerlessSurfaceGuard` failing on an import the moved files still hold to a Ledger path — the literal R13 symptom, now expected to be absent. A `RoutingMap` literal appearing inside the package. A second `CapabilityUnavailable` class in either repository. A Cargo file supplying a routing map. Or Ledger re-adding a local resolution because the package's dispatch lacked a case it needed, which would mean the split was cut at the wrong joint.

## Known Risks

**Git-tracked QuickBooks credentials — a tracked risk with an owner, not a build prerequisite.** `unicorn-ceo/.mcp.json` is tracked in git and holds a QuickBooks client identifier, client secret, refresh token and realm identifier as inline literal values. Key names only are recorded here; no value has been opened or reproduced. **Measured 2026-08-14:** that file and Ledger use **different Intuit OAuth applications against the same production realm** — the same QuickBooks company. Revision 2's escalation of this to a prerequisite is therefore **withdrawn**: rotating the tracked credential does not invalidate Ledger's refresh token, so it does not sit in front of this chain and does not gate Cargo's first production write. What remains true is that the credential writes to the real books of the real company and is readable by anyone with access to that repository's history, so it is a live exposure with an owner and a date. `AC-KIT-009.16`, `AC-KIT-010.11` and `AC-KIT-010.15` stop `@paver/qb` from repeating the pattern; they do not remediate this one. **Remediation owner: Tony Davis (operator).** The action is hard-gated (credential operation): revoke and re-issue in the Intuit developer console, treat the exposed values as burned regardless of whether history is rewritten. Neither Boris nor a Work Order performs it.

**One Intuit application, two products, one rotating credential.** Under D4 the lock spans Cargo's serverless instances and Ledger's CLI (ADR-002). A driver graded only against processes of one product has not been graded against the contention that exists — which is what `AC-KIT-011.30` and `AC-KIT-011.31` are for.

**Two systems hold a `Bill` create grant, permanently.** Operator decision D1 is a deliberate exception to one-normal-writer-per-write-method, and an exception with a name on it is still an exception. The controls are ADR-011's four parts — distinguishable kinds, separate entry point, required reason, stamped record — and what they do not do is reduce the number of deployables that can be wrong from two to one. Recorded in full at `@blueprint:cargo-container-blueprint` ADR-018.

**The provenance stamp is evidence, not proof — and that is now a decision, not a gap.** ADR-011 states the two limits; operator decision D4 accepts them and rejects the two-application alternative (`@REQ-KIT-008` Closed Question 4).

**A stranded exchange intent has no defined ending yet.** ADR-001 specifies the row that makes the state *detectable*; what to do on detection depends on whether Intuit honours a grace window for a prior refresh token, which is unsourced. Until `@REQ-KIT-008` Open Question 2 is answered against the API reference, a driver that detects a stranded intent has one safe move — refuse with `ReauthorizationRequired` — and that conservatism costs an operator re-consent on a case where a retry might have sufficed.

**An outbound HTTP call is made while a database lock is held.** `AC-KIT-009.3` requires it and neither the Requirement nor this Blueprint softens it: a lock that does not span the exchange does not prevent the double-exchange that costs the whole connection. It is bounded by `AC-KIT-009.22` (the common path takes no lock at all), `AC-KIT-009.23`–`.26` (the exchange is timed out and a timeout writes nothing) and `AC-KIT-009.27` (nothing else goes out while the lock is open). It remains a smell a reviewer should re-examine rather than inherit.

**The marker's queryability is unsourced.** ADR-005 fixes the field's composition and deliberately does not fix the query operator. If no returned field is filterable, `AC-KIT-008.29`/`.30` are unverifiable and must be re-cut against what the API does support — not shipped as a no-op. `WO-KIT-001` carries this as a hard pause (`spec-first-privatenote-OQ3`), and it is `@REQ-KIT-008` Open Question 1.

## Requirement Defects — disposition

The seventeen defects this Blueprint routed to Karl in Revision 1 are closed by `@REQ-KIT-008` Revisions 2 and 3, except where noted. The table is kept rather than deleted so a reader arriving from an older citation can see where each landed.

| # | Where | Disposition |
|---|---|---|
| 1 | freshness re-check | **Closed** — `AC-KIT-009.17` (package contract), `AC-KIT-009.18` (package test). ADR-006. |
| 2 | `AC-KIT-009.6` graded exchange count | **Closed** — `.6` re-cut to mutual exclusion; `AC-KIT-009.21` forbids the suite grading exchange count. ADR-006. |
| 3 | null document number | **Closed** — `AC-KIT-008.26`. ADR-005. |
| 4 | caller-supplied gate opt-out | **Closed** — `AC-KIT-008.22`. ADR-007. |
| 5 | idempotency and the lost response | **Closed** — `AC-KIT-008.27` through `.30`, `.33`, `.34`, `.40`; `AC-KIT-010.19`. ADR-005. |
| 6 | `AC-KIT-008.19` gate enumeration and order | **Closed** — `.19` re-cut to the code's order and now enumerates the class gate (`.20`, `.21`) and payload completeness (`.26`). ADR-007. |
| 7 | approval binds the dispatched payload | **Closed** — `AC-KIT-008.23` through `.25`. ADR-004. |
| 8 | vendor unverified on re-read | **Closed** — `AC-KIT-008.32`. |
| 9 | grant table names no consumer workflow | **Closed** — `@REQ-KIT-012`, `AC-KIT-012.1` through `.5`. ADR-003. |
| 10 | persist failure does not say "re-authorize" | **Closed** — `AC-KIT-009.19`. ADR-001. |
| 11 | `AC-KIT-009.16` vs `AC-KIT-010.11` | **Closed** — `.16` reworded, `AC-KIT-010.15` added (the package reads no environment variable). |
| 12 | compound "shall not define" criteria | **Closed** — split into `AC-KIT-011.3`, `.9`, `.16` through `.20`, `.24`, `.25`, `.26`, each one grep-checkable claim. |
| 13 | `AC-KIT-011.2` deletes with no replacement | **Closed** — `.2` adds `guarded.ts`; `AC-KIT-011.15` states the break-glass replacement; `AC-KIT-011.23` states the non-create replacement. ADR-009, ADR-011. |
| 14 | `AC-KIT-011.6` test-case count | **Closed** — re-cut to a checked-in expected file count. Declared near-miss in the Requirement's notes. |
| 15 | version skew process-only | **Closed** — `AC-KIT-011.14`, `.21`, `.27`. ADR-008. |
| 16 | Node runtime unqualified | **Closed** — `AC-KIT-010.14`, `AC-KIT-010.16`. |
| 17 | the preview screen belongs to `@REQ-CARGO-018` | **Closed by `@REQ-KIT-008` Revision 4** — written into `@REQ-CARGO-018` as `AC-CARGO-018.6` through `.9`. `@REQ-KIT-008` Closed Question 3. |

Two questions remain open against this package and are recorded at `@REQ-KIT-008` rather than here: the marker's filterability (**Open Question 1**, ADR-005) and what a stranded exchange intent should do (**Open Question 2**, ADR-001). Both need the Intuit API reference, not an architect. The attribution question that stood here through Revision 2 is **closed** by operator decision D4 (Closed Question 4, ADR-002 and ADR-011).

**Defects this Blueprint routes back in Revision 4 — three, all to Karl.** (1) **The package exports no read**, so `AC-CARGO-018.48` and `AC-KIT-011.42` cannot both hold. ADR-015 decides the mechanism and needs one criterion: the package shall export a read that resolves a QuickBooks account, class, item or vendor by identifier and returns the name QuickBooks holds for it — plus `AC-CARGO-018.48` re-cut to perform that read **through the package**. (2) **Nothing obliges the exported adapter to carry a dated capability declaration**, while `AC-KIT-008.21` refuses a create without one and `self-hosted.ts:316` declares `measuredAt: null`. As measured, the only exportable adapter refuses every create. ADR-014's new clause decides it; the criterion is Karl's. (3) **`AC-CARGO-018.40` requires an item reference on every SKU line and no artifact holds a SKU-to-Item mapping** — decided at `@blueprint:cargo-container-blueprint` ADR-019 item 6, criteria owed there. **R13 is closed by ADR-016** and needed no Requirement, as `@REQ-KIT-008` Revision 5 said it would not.

**Defects this Blueprint routed back in Revision 3.** Both are mine and both are already in `@REQ-KIT-008`'s open list rather than needing a new route: ADR-001's `generation`/`rotated_at` recovery claim was **false** and is withdrawn above — `WO-KIT-002`'s added AC 2 found it, Revision 2 of this file restated the claim instead of addressing it, and the replacement mechanism is now specified. The Requirement half it still needs is one AC in `@REQ-KIT-009` for the exchange-intent record, which Karl has correctly declined to author against an unsourced Intuit behaviour.

<!--
Boris's notes (Revision 4, 2026-08-14 — the read surface, and what crosses with the adapter):
- Code-grounded reads this session: self-hosted.ts:22-24 (imports declareCapabilities/AdapterCapabilities
  from ../capabilities.js and Adapter from ../router.js — the R13 fact), self-hosted.ts:316
  (measuredAt: null), capabilities.ts:42,69 (the declaration shape and the `?? null` default),
  vendor-bill.ts:630-658 (assertPerLineClassRefSupported and PER_LINE_CLASSREF_BY_CONSTRUCTION — why
  Ledger does not hit the refusal and why the package must not copy the exemption),
  rest-client.ts:130 (the interpolated WHERE, which is why ADR-015 leaves the wire form to the WO),
  ls src/qb/adapters (capability-differ.ts is there, not in src/qb/), grep node-quickbooks over
  ledger/src and package.json (no hits — connector ADR-003 corrected).
- ADR-015 is the single ruling on the read surface. @blueprint:cargo-container-blueprint ADR-019
  item 4 cites it rather than restating it.
- ADR-016 is the single ruling on R13. @blueprint:quickbooks-connector ADR-008 cites it.
- ADR-014's dated-declaration clause is a defect in my own ADR, found by reading the adapter I told
  the chain to export. Same failure shape as ITEM A: a gate that refuses every payload.
- NOT decided here, still: the marker's filterability (Open Question 1) and what a stranded exchange
  intent does (Open Question 2). Both need the Intuit reference.

Boris's notes (Revision 3, 2026-08-14 — the authorization widening):
- Six-Principle Stamp re-checked. Code-grounded: every new behavioural claim carries a file:line read
  this session — creation-policy.ts:80-85 (the `if (!isCreation(method)) return` early exit),
  method-groups.ts:56-70 (WRITE_METHODS six vs CREATION_METHODS two), guarded.ts:53-56,72-78 (both
  call sites), rest-client.ts:37,47,52 (fetchImpl already injected), hosted.ts:1 (node:fs),
  tenant.json:14 and :16-19 (routing note + stdio connector).
- STALE CLAIMS CORRECTED IN THIS REVISION, each one a thing a builder would otherwise have built:
  1. #GuardedWriteDispatcher refused only ungranted CREATES and said nothing about updates. Re-cut;
     #GrantSetMembershipGate is the new node and ADR-013 is the decision.
  2. ADR-001's "generation increments ... so the recovery path can distinguish 'we exchanged and lost
     the result' from 'we never exchanged'" was FALSE. Both fields roll back with the transaction the
     xact lock is scoped to. Withdrawn in place; the committed ExchangeIntent row is the mechanism.
  3. ADR-003's "empty create-grant sets" for Ledger's eleven identities — under AC-KIT-008.44 an
     empty set refuses every write, so this would have broken reconcile and expense-review. Now
     normal grants of updateBill/updateBillPayment/updatePurchase (AC-KIT-012.29/.31/.32).
  4. #PostgresAdvisoryLockTokenDriver cited AC-KIT-009.14/.15 as its responsibilities. Those are the
     schema's (WO-CARGO-020) and the package's (WO-KIT-001, which puts the driver Out of Scope). The
     driver is WO-KIT-002's; it now cites AC-KIT-009.30/.31 for what it IS and AC-KIT-009.20 for the
     property the suite grades it on. Nothing was unbuilt; the block named claimants that were not.
  5. ADR-002's credential-rotation PREREQUISITE — measured false (different Intuit applications, same
     production realm). Downgraded to a tracked risk with an owner, here and in Known Risks.
  6. ADR-009's "Ledger's adapters do not cross" — re-cut by ADR-014 on measurement. Cargo cannot post
     without an adapter and only the self-hosted REST pair is exportable.
  7. ADR-005 and the defect table cited "@REQ-KIT-008 Open Question 2/3" under Revision 3 numbering.
     Revision 4 renumbered: filterability is Open Question 1, the exchange intent is Open Question 2,
     attribution is Closed Question 4.
- ADR-013 is the single ruling on authorization. @blueprint:quickbooks-connector's #CreationPolicy is
  renamed #WriteGrantPolicy in the same revision; @blueprint:cargo-container-blueprint ADR-018 layer 1
  and 2 cite it rather than restating it.
- ADR-014 is the single ruling on which adapter crosses. Both consumer blueprints cite it.
- NOT decided here, and deliberately: what a stranded exchange intent does (needs the Intuit
  reference — @REQ-KIT-008 Open Question 2), and whether the marker's field is filterable (Open
  Question 1). Neither is an architect's to answer.

Boris's notes (Revision 2, 2026-08-14 — the backwards reconciliation):
- Six-Principle Stamp: Code-grounded (every behavioural claim carries a file:line from the Ledger
  source or a migration), Composition-first (component blocks are nodes, paragraphs are edges),
  Structured-and-narrative, Implementable, Markdown-native, Living-artifact.
- ADR format extended with "Options considered" and "How we would know this is wrong" at the
  operator's request for this decision set. House shape (Context/Decision/Consequences) preserved.
- Stale citations fixed in this revision: #CustodyConformanceSuite's exchange-count responsibility
  (AC-KIT-009.6 no longer means that) and its tenant-scoping cite (.9.14/.9.15 -> .9.20); the same
  pair inside ADR-006's Decision; the ADR-006 Consequences claim that .9.6 "must be re-cut" (done);
  the Key Contract "no raw contract surface" (-> no UNGATED surface, AC-KIT-008.39); ADR-003's
  "Ledger's other eleven workflow names stay in Ledger's own creation-policy" (-> they move into the
  package table with empty create-grant sets, since AC-KIT-011.2 deletes that file); ADR-003's
  "each granting exactly ['createBill']" (grant kinds now differ); ADR-002's Context claim that the
  store question is open (closed) and its pooler-availability silence (measured, ADR-010); the
  Requirement-Defect table, all seventeen rows.
- ADR-009 is the single ruling on contract.ts. Every other document must CITE it rather than restate
  it: @blueprint:cargo-container-blueprint ADR-018 layer 2, @blueprint:quickbooks-connector ADR-006,
  and WO-KIT-001 (whose added-AC 2 is withdrawn - Foreman F1).
- ADR-010 is the single ruling on where the custody driver lives. @blueprint:cargo-container-blueprint
  ADR-020 and @blueprint:quickbooks-connector ADR-006 cite it; neither restates the lock protocol.
- @blueprint:paver-os-kit-platform still needs a delta adding #QbPackage to Core Components and this
  file to Composes, and kit/README.md:24 still reads "@paver/qb - deferred (REQ-KIT-007)". Both are
  outside this unit.
-->
