# @paver/qb — The Shared Guarded QuickBooks Client

> **Type:** Feature Requirements Document (FRD)
> **ID Prefix:** KIT
> **Status:** Draft
> **Owner:** Tony Davis (operator) · Karl Strunk (Author)
> **Revision:** 6 — 2026-08-14. The read, and the date on the adapter's declaration. Revision 5 gave the adapter a Requirement and left two criteria that cannot both be met and one adapter that cannot post. `AC-CARGO-018.48` obliges Cargo to read a mapping identifier **from QuickBooks** before saving it; `AC-KIT-011.42` forbids any Cargo source file from constructing an Accounting API request; the package exported no read at all — so every permitted path was closed, in one revision. Separately, `AC-KIT-008.21` refuses a create when the receiving adapter's capability declaration carries no measurement date, and the only adapter this package may export declares none, so as measured it refuses every create. Closed by AC-KIT-010.26 and .27 (the dated declaration and the fence around it) and AC-KIT-010.28 through .36 (the exported reference read). `@blueprint:paver-qb-guarded-quickbooks-client` ADR-014 Revision 4 and ADR-015 decide the mechanisms; these are the criteria behind them. **R13 is closed** by that Blueprint's ADR-016 and needed no criterion, as Revision 5 predicted. No AC in Revisions 1–5 changed meaning. Changed and added AC ids are listed in Karl's notes.
> **Revision 5** — 2026-08-14. The adapter has a Requirement. Revision 4's chain decided in two Blueprints (`@blueprint:paver-qb-guarded-quickbooks-client` ADR-014, `@blueprint:quickbooks-connector` ADR-008) that the self-hosted REST adapter crosses into the package — and no Acceptance Criterion said the package exports an adapter, that Ledger's copy goes, or that Cargo may not write its own. That is architecture with no Requirement behind it, the same gap `karl-ac-shared-driver` closed for the token driver and left open for the code that builds the bill's bytes; unfixed, the chain ships two QuickBooks REST clients against the real books and nothing refuses a third. Closed by AC-KIT-010.21 through .25 and AC-KIT-011.35 through .44. AC-KIT-010.7 and AC-KIT-010.20 are untouched and still forbid the subprocess adapter and any adapter that cannot carry a per-line class. No AC in Revisions 1–4 changed meaning. Changed and added AC ids are listed in Karl's notes.
> **Revision 4** — 2026-08-14. The authorization widening. Revision 3 exported the whole guarded contract to both consumers but left the grant vocabulary create-only, so a token granting `createBill` satisfied every gate on `updateBill`, `updateBillPayment` and `updatePurchase` and nothing refused it. Authorization is re-cut over the **whole write surface**; @REQ-KIT-012's partition is re-cut from create methods to write methods; operator decision D4 closes Revision 3's Open Question 2 (advisory provenance, one Intuit application, two-application attribution rejected); the six owed ACs are written; the preview, the bound approval, the adoption path and the posting budget are written into @REQ-CARGO-018 as AC-CARGO-018.6 through .30. Changed and added AC ids are listed in Karl's notes.
> **Revision 3** — 2026-08-14. The backwards reconciliation. Operator decisions D1 (Ledger keeps a declared break-glass bill grant), D2 (the partition must survive Cargo adding inventory items) and D3 (Cargo's transaction pooler is measured and works) are cut into ACs; the non-create guards `reconcile` and `expense-review` depend on are given a home; the `AC-KIT-012.3` and `contract.ts` contradictions are decided once. Changed and added AC ids are listed in Karl's notes.
> **Revision 2** — 2026-08-14. Added @REQ-KIT-012 (the entity-writer partition, operator correction), and processed the seventeen Requirement defects routed to Karl by `@blueprint:paver-qb-guarded-quickbooks-client`.
> **Traces up to:** @REQ-KIT-007 (AC-KIT-007.1 names `@paver/qb` as a deferred package that receives its own Requirement when a first consumer commits; Cargo is that consumer, operator-confirmed 2026-08-14). Bootstrap mode is **not** claimed — the upstream authority exists.
> **Downstream consumers:** @REQ-CARGO-018 (AC-CARGO-018.2, AC-CARGO-018.5) · Ledger's existing vendor-bill workflow · approval principle from @REQ-MADSON-006 (AC-MADSON-006.4).
> **Implemented in:** <!-- populated as the Blueprint + Work Orders ship -->

## Overview

Ledger holds a working guarded path for creating a QuickBooks bill. It is five gates and a proof step, in one file: a capability token that only the vendor-bill workflow holds (`src/qb/creation-policy.ts:41`), a plan-shape check that refuses anything but one Bill change (`src/workflows/vendor-bill.ts:1044-1050`), an approval check that recomputes both the plan hash and the item-decision hash rather than trusting the stored ones (`src/qb/approval-gate.ts:65,98`), a per-line class check (`src/workflows/vendor-bill.ts:1056`), a duplicate search run immediately before the write (`src/workflows/vendor-bill.ts:1063-1070`), and a post-create re-read that is the only source of what QuickBooks actually stored (`src/workflows/vendor-bill.ts:1099-1133`). That path runs today only as a one-shot local CLI. Nothing in Ledger wakes up, and nothing in Ledger knows Cargo exists.

Cargo needs the same write from a button, in the browser, watched. The team's confidence comes from seeing a bill appear when someone clicks — a local CLI or a polling agent fails that test, so Cargo runs the write itself on a Vercel serverless function. That means the guarded path has to leave Ledger's process. The wrong move is copying it: two copies of the gates drift, and the drift is what writes a wrong bill. So the guarded path is **extracted** into `@paver/qb` and both products consume it as a pinned dependency.

The boundary between the two products is not a limit on what Cargo may do. It is a partition of QuickBooks by **write method**, and the **normal** writer of each write method is the system in which the change that write records originates. Cargo is the SKU master and the purchase-order master, so Cargo originates the factory bill today and is expected to originate the inventory item later. Ledger originates categorization, reconciliation, month close and the rest, so Ledger is the normal writer of the updates that carry those decisions — including updates to a bill Cargo created. The partition is enforceable rather than aspirational because the package holds the grant table: a consumer's identity carries the set of write methods it may call, the package builds the token, and a call outside the grant refuses (@REQ-KIT-012). Adding `createItem` to Cargo's grant is then a declared capability change and a version bump — not a re-architecture, and not a line a route handler can write for itself. The invariant is not that a write method is granted once; it is that no ungranted write method can be called, over a grant set the table owns.

The partition is stated over write methods rather than over entity types because that is the level authorization operates at, and because the coarser statement had a hole. Revision 3 wrote the rule over entities and enforced it over creates: a token granting exactly `['createBill']` satisfied the requirement that a token be present on every write method, and nothing then refused it `updateBill`, `updateBillPayment` or `updatePurchase`. That was harmless while all twelve workflow identities lived in one trusted local CLI process, where "may update, may create nothing" was the idiom for a read-and-categorize workflow. It stopped being harmless the moment a second product's serverless identity entered the same table. A partition that governs half the write surface is decoration.

One entity type has a second writer, deliberately. Ledger keeps `createBill` as a **break-glass** grant — for the cutover window, for the day Cargo is unavailable, and for a bill that has to exist outside a purchase order. A break-glass grant is not the same object as a normal grant and must not read like one: the table records which kind each entry is, the two paths are exported separately so importing the break-glass one is a visible act rather than a fallback, the break-glass call refuses without an operator-supplied reason, and every create the package performs stamps its consumer workflow identity and its grant kind into the bill. That last is what keeps the partition from being decorative — afterwards, a bill can be sorted into "Cargo, normal", "Ledger, break-glass, for this reason", or "stamped by neither, so it was not created through this package." What the stamp is not is proof (see Open Questions).

Extraction also moves more than the create. Ledger's `reconcile` and `expense-review` write to QuickBooks through the same three modules the create path uses (`src/qb/guarded.ts:4-6`), so deleting those modules from Ledger without replacing them leaves two money-touching workflows with no approval check and no post-write verification. The package therefore exports the whole guarded contract — approved-change dispatch and post-write re-read, every method behind a capability token — not only the bill gate chain. Ledger's non-create workflows become consumer workflow identities in the same table, holding grant sets that name the update methods they dispatch and no create method. There is then one grant table in the fleet, not two, and it authorizes every write rather than every birth.

One consumer runs the guarded path on Vercel, which decides the adapter. Ledger routes every method group at its self-hosted REST adapter (`config/tenants/madson/tenant.json:14`) because the WO-006 capability diff found the hosted adapter cannot carry a per-line class reference on an item-based line, and every Madson bill line carries a brand class. Cargo needs the same adapter for the same reason, and needs it doubly: the other adapter Ledger ships communicates by spawning a subprocess, which cannot run on a serverless function at all. So the adapter Cargo must use is the one Ledger already posts with — one path, measured, for both consumers (AC-KIT-010.7, AC-KIT-010.20). That adapter therefore leaves Ledger with the gates: the package exports it, Ledger deletes its copy, and no Cargo file writes a second one (AC-KIT-010.21, AC-KIT-011.35, AC-KIT-011.41). Sharing the gates and not the request shape would leave the two products agreeing on what may be written and disagreeing on the bytes.

Extraction exposes one problem Ledger never had to solve. Intuit rotates the refresh token on every exchange. Ledger serializes exchanges with an in-process promise chain (`src/qb/token-store.ts:137-144`), which is correct for one process and worthless for N. Two serverless instances exchanging the same refresh token invalidate the QuickBooks connection; posting then fails 401 and presents as an auth bug rather than a race. Operator decision D4 makes that lock **cross-product**, not merely cross-process: both consumers authenticate as one Intuit application against one shared record, so Cargo's N serverless instances and Ledger's CLI contend for the same rotating credential and a Ledger `auth` run during a Cargo post is the same race as two Cargo instances. The lock is therefore graded across operating-system processes without regard to which product started them (AC-KIT-009.5), and each consumer grades the driver it actually deploys over the route it deploys over (AC-KIT-011.30, AC-KIT-011.31). The `TokenStore` interface (`src/qb/token-store.ts:32-41`) is already the right seam — its own header comment anticipates a second driver — but the lock behind it becomes a database lock, and the record gains a tenant key. This FRD gives that the most specific Acceptance Criteria in the document, because it is the failure that costs the whole connection rather than one bill.

After this FRD ships: `@paver/qb` is the only place in the fleet where a QuickBooks write is gated; each QuickBooks write method has at most one normal writer and at most one break-glass writer, and the grant table says which is which; no write method is authorized by anything other than membership in the calling identity's grant set; Ledger imports the package and has deleted its local copies; Cargo creates one deliberate factory bill from a button and records the identifier the package returns, closing AC-CARGO-018.2 and AC-CARGO-018.5; every bill the package creates carries the identity and grant kind that created it; and a token-custody driver cannot be adopted without passing a shipped conformance suite that fails any lock which does not hold across processes.

## Terminology

- **Guarded write path** — the ordered sequence of gates a create passes through before a request reaches QuickBooks, plus the re-read that proves what was stored.
- **Refuse** — raise an error that ends the call before any QuickBooks write request is sent.
- **Write method** — a method on the package's QuickBooks contract that changes state in QuickBooks. Every create method and every non-create write is a write method; a read is not.
- **Create method** — a write method that brings a new entity into existence, as distinct from one that updates, reads, or categorizes an existing entity.
- **Consumer system** — one repository that depends on `@paver/qb`: Cargo (serverless, Node runtime on Vercel) or Ledger (local one-shot CLI).
- **Consumer workflow identity** — a value the package defines that names one workflow in one consumer system, for example a Cargo factory-bill workflow. It is the key of the grant table.
- **Originating system** — the consumer system in which an entity's authoritative record is first created. Cargo originates the purchase order, the factory bill, and the SKU. Ledger originates categorization, reconciliation, close, forecast, anomaly, margin, chase, and tax-prep records.
- **Change origin** — the consumer system in which the change a write method makes originates. For a create method it is the originating system of the entity. For a non-create write it is the system in which the decision that write records is made: Cargo originates the factory bill, and Ledger originates the categorization, reconciliation and expense-review decisions written onto it afterwards.
- **Capability token** — a value naming one consumer workflow identity and the set of write methods that identity may call. Produced only from the grant table held inside the package.
- **Grant table** — the mapping, held inside the package, from each consumer workflow identity to the set of write methods it may call and the kind of each grant.
- **Grant set** — the set of write methods one grant table entry records for one consumer workflow identity. A create method and a non-create write are recorded in the same set, and nothing in the authorization check distinguishes them: membership is the only question asked.
- **Grant kind** — whether a grant table entry is normal or break-glass.
- **Normal grant** — a grant table entry naming the identity that creates an entity type in the ordinary course, because the entity originates in that identity's system.
- **Break-glass grant** — a grant table entry permitting a second system to create an entity type through a separately exported path that refuses without an operator-supplied reason. It exists for the cutover window, for the day the normal writer is unavailable, and for an entity that has to exist outside the normal writer's originating record.
- **Break-glass reason** — the operator-supplied text explaining why a break-glass path was used, required at the call and written into the created entity.
- **Provenance stamp** — the consumer workflow identity, the grant kind, and the break-glass reason where one applies, written into a created entity in a field QuickBooks returns on a read.
- **Guarded contract** — the package's surface for dispatching an approved change to QuickBooks and verifying it by re-read. Every method on it requires a capability token, whether the change is a create or not.
- **Non-create write** — a QuickBooks write that modifies an entity that already exists: an update, a re-link, a re-categorization.
- **QuickBooks adapter** — the code that turns a call on the guarded contract into a QuickBooks request and the response back into a contract value. It is where the bill's bytes are built: the line details, the class reference's placement, the API version, the query escaping.
- **QuickBooks Accounting API** — Intuit's REST interface for accounting entities, addressed under a company path and an API version. The subprocess connector and the hosted connector speak neither this interface nor this shape, which is why a criterion naming it does not reach them.
- **Gate-contract version** — an integer the package exports that increments whenever the behaviour of any gate named in this FRD changes, so each consumer can assert the contract it was built against from inside its own repository.
- **Change plan** — the record of proposed changes an operator reviews, carrying an approval with two hashes: one over the proposals, one over the operator's per-item decisions.
- **Approved payload** — the create payload carried as the single proposed value of the change plan the operator approved. Every approved figure is read from it.
- **Approved total / approved line count** — the money total and line count of the approved payload. Not the figures the create response returns.
- **Idempotency marker** — a value derived from the change plan's content, written into the created entity and queryable, so a create whose response was lost is found rather than repeated.
- **Post-write re-read** — fetching the created record back from QuickBooks by its identifier and deriving every reported figure from that fetch.
- **Token custody** — storing, reading, and rotating the QuickBooks OAuth tokens. Expressed as an interface, so the medium (encrypted file, database row) is a driver choice.
- **Locked operation** — a read-modify-write over the stored token record that no other caller can interleave with.
- **Conformance suite** — a test suite the package ships that any token-custody driver runs against itself, so a driver's correctness is measured rather than asserted.
- **Tenant key** — the value that distinguishes one QuickBooks company's token record from another's in a shared store.

## Requirements

### REQ-KIT-008: `@paver/qb` owns the guarded QuickBooks write path

**User Story:** As the operator approving a factory bill, I want every guard between the approval and the QuickBooks write to live in one package, so that the bill that appears matches the bill I read and no product can post around the guards.

**Acceptance Criteria:**

*The gates*

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

*The approval binds the bytes that are sent*

- **AC-KIT-008.23:** The package shall construct the change plan from the create payload supplied by the caller, and shall carry that payload as the plan's single proposed value.
- **AC-KIT-008.24:** The package shall dispatch the payload carried by the approved plan, and shall not re-derive a payload between the approval check and the dispatch.
- **AC-KIT-008.25:** The package shall read the approved total and the approved line count from the approved payload, and shall not recompute them from any other source.

*The duplicate probe*

- **AC-KIT-008.9:** Immediately before dispatching the create, the package shall query QuickBooks for an existing bill holding the same vendor identifier and the same document number.
- **AC-KIT-008.10:** When the query in AC-KIT-008.9 returns a bill, the package shall refuse and shall name the existing bill in the error.
- **AC-KIT-008.26:** When the create payload carries no document number, the package shall refuse.
- **AC-KIT-008.27:** The package shall derive an idempotency marker from the change plan's content.
- **AC-KIT-008.28:** The package shall write the idempotency marker into the created bill in a field QuickBooks returns on a read.
- **AC-KIT-008.29:** Immediately before dispatching the create, the package shall query QuickBooks for an existing bill carrying the same idempotency marker.
- **AC-KIT-008.30:** When the query in AC-KIT-008.29 returns a bill, the package shall refuse and shall name the existing bill in the error.
- **AC-KIT-008.31:** When a search underlying AC-KIT-008.9 or AC-KIT-008.29 returns a truncated result set, the package shall refuse rather than treat the result as an absence.
- **AC-KIT-008.40:** The package shall write the idempotency marker in a form the query in AC-KIT-008.29 matches exactly when the same field also carries the provenance stamp required by AC-KIT-012.23.

*The re-read is the only proof*

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

*Order*

- **AC-KIT-008.19:** The package shall run its gates in this order — plan shape (AC-KIT-008.6), capability (AC-KIT-008.1), approval hashes (AC-KIT-008.3 through AC-KIT-008.5), item decision (AC-KIT-008.7, AC-KIT-008.8), class capability (AC-KIT-008.20, AC-KIT-008.21), payload completeness (AC-KIT-008.26), duplicate probes (AC-KIT-008.9, AC-KIT-008.29) — and shall send no QuickBooks request other than the duplicate probes until every preceding gate has passed.

*The non-create writes are guarded by the same package*

> Ledger's `reconcile` (`src/workflows/reconcile.ts:972`) and `expense-review` (`src/workflows/apply-review.ts:56`) dispatch through `GuardedContract` (`src/qb/guarded.ts:4-6`), which composes the same three modules AC-KIT-011.2 deletes. Extracting only the create path would leave both workflows recomputing an approval hash and verifying a write from a second copy — the drift this FRD exists to end, moved one file over. The package therefore owns the whole guarded contract.

- **AC-KIT-008.35:** The package shall expose the dispatch of an approved non-create change to QuickBooks as a method on the guarded contract.
- **AC-KIT-008.36:** The guarded contract shall require a capability token on every write method it exposes.
- **AC-KIT-008.37:** When a caller invokes a create method through the guarded contract with a capability token that does not grant that create method, the package shall refuse.
- **AC-KIT-008.43:** When a caller invokes a non-create write method through the guarded contract with a capability token that does not grant that write method, the package shall refuse.
- **AC-KIT-008.44:** The package shall determine whether a capability token permits a write method by that method's membership in the token's grant set alone.
- **AC-KIT-008.38:** The package shall re-read every record written through AC-KIT-008.35.
- **AC-KIT-008.42:** The package shall derive the verification result of a write dispatched through AC-KIT-008.35 from the re-read in AC-KIT-008.38, and shall derive it from no part of the write response.
- **AC-KIT-008.39:** The package shall export no path that dispatches a QuickBooks write without a capability token.
- **AC-KIT-008.41:** The package shall export the function that renders a change plan's proposed changes for operator review, because the change plan's shape is defined by the package.

### REQ-KIT-009: Token custody is a driver interface that holds across processes

**User Story:** As the operator whose books depend on one live QuickBooks connection, I want token rotation to be safe when several server instances run at once, so that a busy afternoon cannot silently kill the connection and present as an authentication bug.

**Acceptance Criteria:**

*The seam*

- **AC-KIT-009.1:** The package shall define token custody as an interface offering a read operation, a locked read-modify-write operation, and a description operation.
- **AC-KIT-009.2:** The package shall depend on no specific storage medium for token custody, and shall accept any value satisfying the interface in AC-KIT-009.1.

*The driver both consumers use ships from the package*

> Two implementations of one lock over one rotating credential is the failure this Requirement exists to prevent, reintroduced by repository layout. AC-KIT-009.1 and .2 define the seam and require the package to accept *any* driver; AC-KIT-010.6 forbids a filesystem-backed one and is silent on a database one. Nothing required the shared driver to exist, so it was architecture with no Requirement behind it — `WO-KIT-002`'s declared gap 1.

- **AC-KIT-009.30:** The package shall export a token-custody driver, satisfying the interface in AC-KIT-009.1, that stores its records in a database.
- **AC-KIT-009.31:** The driver required by AC-KIT-009.30 shall take its database handle as a caller-supplied argument, so that the package imports no database library and AC-KIT-010.1 through AC-KIT-010.3 continue to hold from that driver's entry point.

*The realm is read from the record, never supplied beside it*

> AC-KIT-009.14 and .15 scope a stored record by tenant key; AC-KIT-010.11 took the realm identifier as a separate caller-supplied value; no criterion required the two to agree. A mismatched pair posts into another QuickBooks company, and the post-write re-read of AC-KIT-008.11 and AC-KIT-008.32 verifies successfully — because it reads back from that same wrong company. `WO-CARGO-020`'s declared gap 2.

- **AC-KIT-009.32:** The package shall read the realm identifier it uses for a QuickBooks request from the token record it read under that request's tenant key.
- **AC-KIT-009.33:** The package shall accept no realm identifier as an argument separate from the tenant key.

*Exchange safety — the package's obligations*

- **AC-KIT-009.3:** The package shall perform every refresh-token exchange inside the locked operation.
- **AC-KIT-009.17:** The package shall re-evaluate the freshness of the token record read inside the locked operation, and shall return that record without exchanging when it is still valid.
- **AC-KIT-009.18:** The package shall ship a test in which two locked operations run in sequence against one stub driver holding an expired record, and that test shall fail unless exactly one exchange occurred.
- **AC-KIT-009.8:** When a refresh exchange returns a rotated refresh token, the package shall write the returned record through the custody driver before returning any token to the caller.
- **AC-KIT-009.9:** When the write in AC-KIT-009.8 fails, the package shall refuse and shall not return the new access token, because a rotated token that was used but not stored ends the connection.
- **AC-KIT-009.19:** When the package refuses under AC-KIT-009.9, it shall raise the same named error it raises under AC-KIT-009.10, so that one error means "re-authorize" on every path that ends the connection.
- **AC-KIT-009.10:** When the stored refresh token is past its expiry, the package shall refuse without attempting an exchange, and shall state that re-authorization is needed.

*What the lock may be held across*

> AC-KIT-009.3 requires an outbound HTTP call to Intuit while a database lock is held. That is a design smell, and it is required rather than tolerated: a lock that does not span the exchange does not prevent the failure the lock exists for, and the alternatives are worse in ways `@blueprint:paver-qb-guarded-quickbooks-client` ADR-001 records. Required is not unbounded, so the bounds are criteria here rather than prose in an ADR. The measured route to the store is Cargo's Supabase shared transaction pooler (`aws-1-us-west-2.pooler.supabase.com:6543`, three IPv4 A records, port open 2026-08-14), on which a transaction-scoped advisory lock is safe and a session-scoped one is not.

- **AC-KIT-009.22:** When the token record read outside the lock is fresh, the package shall return it without taking the lock.
- **AC-KIT-009.23:** The package shall bound the refresh-token exchange with a caller-supplied timeout.
- **AC-KIT-009.24:** When the timeout in AC-KIT-009.23 elapses, the package shall abandon the exchange.
- **AC-KIT-009.25:** When the package abandons an exchange under AC-KIT-009.24, it shall write no token record.
- **AC-KIT-009.26:** When the package abandons an exchange under AC-KIT-009.24, it shall refuse.
- **AC-KIT-009.27:** The package shall perform no outbound request other than the refresh-token exchange while the locked operation is open.

*Exchange safety — what the driver is graded on*

- **AC-KIT-009.4:** The package shall ship a conformance suite that a token-custody driver runs against itself.
- **AC-KIT-009.5:** The conformance suite shall run its concurrency criteria across separate operating-system processes contending for one stored record, not across concurrent calls within one process.
- **AC-KIT-009.6:** The conformance suite shall fail a driver that permits two processes to hold the lock over one tenant key at the same time.
- **AC-KIT-009.7:** The conformance suite shall fail a driver whose locked operation permits a second caller to read the stored record before the first caller's write completes.
- **AC-KIT-009.20:** The conformance suite shall fail a driver that returns a record stored under a tenant key other than the one requested.
- **AC-KIT-009.21:** The conformance suite shall grade a driver on lock semantics and tenant scoping only, and shall not grade a driver on the number of exchanges performed.
- **AC-KIT-009.28:** The conformance suite shall fail a driver whose lock is still held after the process that took it exits without completing its operation.
- **AC-KIT-009.29:** The conformance suite shall run its criteria against the driver over the same connection route the consumer uses in production.

*The record*

- **AC-KIT-009.11:** The package shall expose token-record encryption and decryption as functions that take the record and the secret as arguments and return or accept a string, holding no state and touching no storage.
- **AC-KIT-009.12:** The encryption and decryption functions shall refuse a secret shorter than 32 characters.
- **AC-KIT-009.13:** Decryption shall refuse a record whose authentication tag does not verify, and shall not distinguish a wrong key from an altered record in the error it raises.
- **AC-KIT-009.14:** A stored token record shall be addressable by a tenant key, so that one store holds records for more than one QuickBooks company.
- **AC-KIT-009.15:** When a caller reads or locks a record, the package shall scope that operation to one tenant key and shall not return a record stored under another.
- **AC-KIT-009.16:** The package's README shall name the environment-variable keys a consumer is expected to set for the client identifier, the client secret, and the token-encryption secret, and no file in the package shall record a value for any of them.

### REQ-KIT-010: The shared surface runs on a serverless function

**User Story:** As a Cargo engineer, I want the package to import cleanly into a Vercel serverless function, so that the button that posts a bill runs the same code the CLI runs instead of a serverless-safe rewrite of it.

**Acceptance Criteria:**

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

*One adapter, and it is the package's*

> AC-KIT-010.7 and AC-KIT-010.20 say which adapters the package may **not** export. Nothing said it exports one at all. A Cargo builder therefore reaches day one holding a guarded contract and no way to send a request, and the cheapest answer available to that builder is to write an adapter — which is two implementations of the line details, the class reference's placement, the API version and the query escaping, under two teams, with the gates shared and the bytes not. `@blueprint:paver-qb-guarded-quickbooks-client` ADR-014 and `@blueprint:quickbooks-connector` ADR-008 decided this by measurement and no criterion carried the decision. These five are that criterion, and AC-KIT-011.35 through .44 are its consumer half.

- **AC-KIT-010.21:** The package shall export a QuickBooks adapter that constructs and sends every QuickBooks request the guarded contract dispatches.
- **AC-KIT-010.22:** The package shall export no more than one QuickBooks adapter that sends a request to QuickBooks.
- **AC-KIT-010.23:** The adapter required by AC-KIT-010.21 shall send every request through the transport injected per AC-KIT-010.10.
- **AC-KIT-010.24:** The adapter required by AC-KIT-010.21 shall be reachable from a public entry point of the package, so that the walk required by AC-KIT-010.4 covers it and AC-KIT-010.1 through AC-KIT-010.3 hold over everything it imports.
- **AC-KIT-010.25:** The package shall accept a QuickBooks adapter supplied by the caller for a method group, so that a consumer may route a group at an adapter the package does not export.

*The exported adapter's capability is a measurement, not a claim*

> AC-KIT-008.21 refuses a create when the receiving adapter's capability declaration carries no measurement date. The adapter AC-KIT-010.21 obliges the package to export declares none — `src/qb/adapters/self-hosted.ts:316` supplies no measurement date and `src/qb/capabilities.ts:69` defaults it to null. Ledger never meets that refusal, because its own gate reads a declaration only when one is supplied for that adapter and otherwise consults a by-construction exemption set (`src/workflows/vendor-bill.ts:630-658`). The package holds no such set and must not acquire one: a by-construction exemption is how an unmeasured claim becomes a capability. As measured on 2026-08-14, then, the only adapter the package may export refuses every create — the same failure shape as a bill line whose mapping record does not exist. `@blueprint:paver-qb-guarded-quickbooks-client` ADR-014, Revision 4.

- **AC-KIT-010.26:** The adapter required by AC-KIT-010.21 shall carry a capability declaration recording the date on which its acceptance of a class reference on every bill line was measured.
- **AC-KIT-010.27:** The package shall hold no exemption by which a create proceeds when the receiving adapter's capability declaration carries no measurement date.

*The read the consumers are forbidden from writing*

> AC-KIT-011.39 and AC-KIT-011.42 forbid any Ledger or Cargo source file from constructing a request to the QuickBooks Accounting API. AC-CARGO-018.48 obliges Cargo to read a mapping record's identifier **from QuickBooks** before saving that record, and AC-CARGO-018.49 through .52 build the whole mapping lifecycle on what the read returned. The package exports no read, so those criteria were written in one chain and cannot both be met: every permitted path is closed, and the one that gives is this package's export list. `@blueprint:paver-qb-guarded-quickbooks-client` ADR-015. The criteria below fix the semantics — an identifier in, the name QuickBooks holds or nothing out. They deliberately do not fix the wire form: whether a by-identifier resolution is a filter query or a read-by-identifier endpoint is an API-shape question the Work Order confirms against the Intuit reference. AC-KIT-010.17 already bounds this read, as it bounds every outbound request.

- **AC-KIT-010.28:** The package shall export a read that resolves a QuickBooks reference from an identifier the caller supplies.
- **AC-KIT-010.29:** The read required by AC-KIT-010.28 shall return the name QuickBooks holds for the identifier it resolved.
- **AC-KIT-010.30:** The read required by AC-KIT-010.28 shall resolve a reference of each kind a bill payload carries an identifier for — an account, a class, an item, and a vendor.
- **AC-KIT-010.31:** The read required by AC-KIT-010.28 shall accept no reference name as the value it resolves, because an account name on a transaction is fully qualified while a search returns the leaf, and leaf names collide.
- **AC-KIT-010.32:** When the identifier supplied to the read required by AC-KIT-010.28 resolves to no QuickBooks record, the package shall report that the identifier resolved to nothing.
- **AC-KIT-010.33:** When the read required by AC-KIT-010.28 fails, the package shall not report the result required by AC-KIT-010.32, because a failed read is not an absent record.
- **AC-KIT-010.34:** The package shall dispatch the read required by AC-KIT-010.28 through the same adapter surface it dispatches a write through, so that one request shape serves reads and writes.
- **AC-KIT-010.35:** The read required by AC-KIT-010.28 shall require no capability token, because a read changes nothing in QuickBooks.
- **AC-KIT-010.36:** The read required by AC-KIT-010.28 shall obtain its access token through the token custody of @REQ-KIT-009, so that no second credential path reaches QuickBooks.

### REQ-KIT-011: Neither consumer holds its own copy of the gates

**User Story:** As the fleet maintainer, I want both products proven against the shared package with their local guard code deleted, so that a gate can never be fixed in one product and left wrong in the other.

**Acceptance Criteria:**

*Ledger*

- **AC-KIT-011.1:** Ledger shall declare `@paver/qb` as a pinned git-tag dependency per @REQ-KIT-002.
- **AC-KIT-011.15:** Ledger's vendor-bill command shall create its bill by calling the package's break-glass write path.
- **AC-KIT-011.2:** Ledger shall delete `src/qb/creation-policy.ts`, `src/qb/approval-gate.ts`, `src/qb/write-verifier.ts`, and `src/qb/guarded.ts`.
- **AC-KIT-011.23:** Every Ledger workflow that writes to QuickBooks shall dispatch that write through the guarded contract the package exports per AC-KIT-008.35.
- **AC-KIT-011.24:** No Ledger source file shall define a capability grant table.
- **AC-KIT-011.25:** No Ledger source file shall recompute a plan hash or a decision hash.
- **AC-KIT-011.3:** No Ledger source file shall import from a path deleted under AC-KIT-011.2.
- **AC-KIT-011.16:** No Ledger source file shall call the QuickBooks contract's `createBill` method directly.
- **AC-KIT-011.17:** No Ledger source file shall compare a retrieved QuickBooks total against an approved total.
- **AC-KIT-011.4:** Ledger shall assert AC-KIT-011.3, AC-KIT-011.16, AC-KIT-011.17, AC-KIT-011.24, and AC-KIT-011.25 with tests held in the Ledger repository, and those tests shall read no file outside the Ledger repository.
- **AC-KIT-011.5:** After adoption, Ledger shall pass `tsc --noEmit` with exit code 0.
- **AC-KIT-011.6:** Ledger's test command shall run every test file matching the repository's own test-file naming convention, and Ledger shall assert that count against a checked-in expected count that a contributor updates when adding a test file.

*Ledger keeps no adapter the package exports*

> `src/qb/adapters/self-hosted.ts` and `src/qb/adapters/rest-client.ts` are the two files that build the request. They cross under AC-KIT-010.21, and a crossing with no deletion is a copy. What stays in Ledger is what cannot cross: `hosted.ts` imports `node:fs` and addresses a hosted connector, and `mcp-stdio-client.ts` spawns a subprocess — neither speaks the QuickBooks Accounting API, so AC-KIT-011.39 does not reach them.

- **AC-KIT-011.35:** Ledger shall delete `src/qb/adapters/self-hosted.ts` and `src/qb/adapters/rest-client.ts`.
- **AC-KIT-011.36:** No Ledger source file shall import from a path deleted under AC-KIT-011.35.
- **AC-KIT-011.37:** Ledger shall obtain the adapter it routes its QuickBooks bill writes at from `@paver/qb`.
- **AC-KIT-011.38:** Ledger shall supply the adapter it keeps to the package per AC-KIT-010.25 for any method group it routes at that adapter, so that deleting the crossed files does not remove Ledger's routing choice.
- **AC-KIT-011.39:** No Ledger source file shall construct a request to the QuickBooks Accounting API.
- **AC-KIT-011.40:** Ledger shall assert AC-KIT-011.36 and AC-KIT-011.39 with tests held in the Ledger repository, and those tests shall read no file outside the Ledger repository.

*Cargo*

- **AC-KIT-011.7:** Cargo shall declare `@paver/qb` as a pinned git-tag dependency per @REQ-KIT-002.
- **AC-KIT-011.8:** Cargo shall create every QuickBooks bill by calling the package's normal guarded write path.
- **AC-KIT-011.26:** No Cargo source file shall import the package's break-glass write path.
- **AC-KIT-011.9:** No Cargo source file shall define a capability grant table.
- **AC-KIT-011.18:** No Cargo source file shall recompute a plan hash or a decision hash.
- **AC-KIT-011.19:** No Cargo source file shall call the QuickBooks contract's `createBill` method directly.
- **AC-KIT-011.20:** No Cargo source file shall compare a retrieved QuickBooks total against an approved total.
- **AC-KIT-011.10:** Cargo shall assert AC-KIT-011.9, AC-KIT-011.18, AC-KIT-011.19, AC-KIT-011.20, and AC-KIT-011.26 with tests held in the Cargo repository, and those tests shall read no file outside the Cargo repository.
- **AC-KIT-011.11:** After adoption, Cargo shall pass `tsc --noEmit` with exit code 0.
- **AC-KIT-011.12:** After adoption, Cargo shall pass `npm run build` with exit code 0.
- **AC-KIT-011.13:** Cargo shall persist the QuickBooks bill identifier returned per AC-KIT-008.18 against the purchase order, closing AC-CARGO-018.5.
- **AC-KIT-011.28:** No Cargo source file shall call a non-create write method on the QuickBooks contract.
- **AC-KIT-011.29:** Cargo shall assert AC-KIT-011.28 and AC-KIT-011.32 with tests held in the Cargo repository, and those tests shall read no file outside the Cargo repository.

*Cargo writes no second client — the negative is the half that prevents one*

> The deletion in AC-KIT-011.35 removes today's second copy. It does nothing about tomorrow's: a Cargo route that needs one field the contract does not expose can reach QuickBooks with the runtime's own fetch and nothing in this FRD refuses it. These four are the refusal, on the AC-KIT-011.16 through .20 precedent — one claim each, greppable inside Cargo's own repository.

- **AC-KIT-011.41:** No Cargo source file shall define a QuickBooks adapter.
- **AC-KIT-011.42:** No Cargo source file shall construct a request to the QuickBooks Accounting API.
- **AC-KIT-011.43:** No Cargo source file shall supply a QuickBooks adapter to `@paver/qb`.
- **AC-KIT-011.44:** Cargo shall assert AC-KIT-011.41, AC-KIT-011.42, and AC-KIT-011.43 with tests held in the Cargo repository, and those tests shall read no file outside the Cargo repository.

*The driver each consumer deploys is the driver each consumer grades*

> AC-KIT-009.4 requires the package to ship a conformance suite; AC-KIT-009.5, .6, .7, .20 and .28 constrain what the suite must fail; AC-KIT-009.29 requires it to run over the production connection route. All five are properties of the suite. No criterion required a consumer to run it. A consumer could hand the package an in-process lock, pass `tsc --noEmit`, pass `npm run build`, satisfy every criterion in this FRD — and kill the QuickBooks connection on a busy afternoon. This is the AC that makes the token-custody design mean anything.

- **AC-KIT-011.30:** Cargo shall run the conformance suite required by AC-KIT-009.4 against the token-custody driver it deploys to production, over the connection route it uses in production, as part of Cargo's own test command.
- **AC-KIT-011.31:** Ledger shall run the conformance suite required by AC-KIT-009.4 against the token-custody driver it deploys, over the connection route it uses in production, as part of Ledger's own test command.
- **AC-KIT-011.32:** No Cargo source file shall define a token-custody driver.
- **AC-KIT-011.33:** No Ledger source file shall define a token-custody driver, other than the local filesystem driver named in this FRD's Scope Boundary.
- **AC-KIT-011.34:** Ledger shall assert AC-KIT-011.33 with a test held in the Ledger repository, and that test shall read no file outside the Ledger repository.

*Version skew*

- **AC-KIT-011.14:** The package shall export a gate-contract version constant that increments whenever the behaviour of any gate named in @REQ-KIT-008 changes.
- **AC-KIT-011.21:** Ledger shall assert the gate-contract version it was built against with a test held in the Ledger repository, and that test shall read no file outside the Ledger repository.
- **AC-KIT-011.27:** Cargo shall assert the gate-contract version it was built against with a test held in the Cargo repository, and that test shall read no file outside the Cargo repository.
- **AC-KIT-011.22:** When a release changes the gate-contract version, the release should be recorded in the Requirements drift log naming every consumer still pinned to an earlier tag.

### REQ-KIT-012: Every QuickBooks write method has one normal writer, and a break-glass writer is declared as such

**User Story:** As the operator whose books two products now touch, I want each QuickBooks write method to have one normal writer — the system the change that write records originates in — with any second writer declared as break-glass and stamped into the record it creates, so that no record is born in two places by accident, no product can quietly modify what another product owns, and I can name the writer of any entity after the fact.

> Revision 3 stated this rule over entity types and enforced it over create methods only. That is the decorative partition this chain was re-cut to avoid: it governed half the write surface while the guarded contract carried all of it. The rule is now stated and enforced over **write methods**, which is finer than entity type and is the level authorization actually operates at. A Bill therefore has one normal creator (Cargo, because the bill originates there) and one normal updater (Ledger, because the categorization and reconciliation decisions written onto it originate there). That is not two writers of one entity; it is one writer per change origin, and it is the only reading under which `updateBill` has an owner at all.

**Acceptance Criteria:**

*The table is the partition*

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

*A break-glass write is not reachable by accident*

- **AC-KIT-012.19:** The package shall expose the break-glass write path from an entry point other than the entry point exposing the normal write path.
- **AC-KIT-012.20:** The package's default entry point shall not export the break-glass write path.
- **AC-KIT-012.21:** The break-glass write path shall take a break-glass reason as a required argument.
- **AC-KIT-012.22:** When the break-glass reason is absent or empty, the break-glass write path shall refuse.
- **AC-KIT-012.27:** No module inside the package shall invoke the break-glass write path, so that no refusal on the normal path falls back to it.

*A create says which system made it*

- **AC-KIT-012.23:** The package shall write the consumer workflow identity that performed a create into the created entity, in a field QuickBooks returns on a read.
- **AC-KIT-012.24:** The package shall write the grant kind used for a create into the field named in AC-KIT-012.23.
- **AC-KIT-012.25:** When a create used a break-glass grant, the package shall write the break-glass reason into the field named in AC-KIT-012.23.
- **AC-KIT-012.26:** When the post-write re-read required by AC-KIT-008.11 returns a bill carrying no consumer workflow identity in the field named in AC-KIT-012.23, the package shall report the write as not verified.
- **AC-KIT-012.30:** The package shall not modify the field named in AC-KIT-012.23 on a non-create write, because doing so would overwrite the stamp the creating system wrote.

*Adding an entity is a declared change, not a re-architecture*

- **AC-KIT-012.8:** The package shall assert the capability gate of AC-KIT-008.1 and AC-KIT-008.43 on every write method it exposes.
- **AC-KIT-012.9:** The package shall ship a test that invokes each exported write path with a capability token that does not grant that path's write method, and fails unless every invocation refuses.
- **AC-KIT-012.10:** The set of write methods the package exposes shall be declared as data that the grant table's values are drawn from, so that a write method absent from that declaration cannot be granted.
- **AC-KIT-012.6:** When a write method is added to a consumer workflow identity's grant set, the test required by AC-KIT-012.4 shall pass without modification, provided AC-KIT-012.3, AC-KIT-012.16, and AC-KIT-012.18 continue to hold.
- **AC-KIT-012.13:** The package shall express the check required by AC-KIT-012.4 as a function over a grant table supplied to it.
- **AC-KIT-012.14:** The package shall ship a test that applies the function of AC-KIT-012.13 to a grant table granting a write method absent from the shipped grant table to identities of one consumer system, and that test shall assert the function reports no violation.
- **AC-KIT-012.15:** The package shall ship a test that applies the function of AC-KIT-012.13 to a grant table normal-granting one write method to identities of two consumer systems, and that test shall assert the function reports a violation.
- **AC-KIT-012.11:** When the grant table gains a write method for any consumer workflow identity, the release shall increment the gate-contract version required by AC-KIT-011.14.
- **AC-KIT-012.12:** A consumer shall not widen its own grants, because the package builds every token from the grant table per AC-KIT-008.2.

## Scope Boundary

**In scope:** the guarded write path and its gates; the guarded contract covering non-create writes; the entity-writer partition, the grant table that enforces it, the break-glass path and the provenance stamp; the post-write re-read; the token-custody interface, its conformance suite, and the pure encryption functions; the one QuickBooks adapter that builds the request bytes and the dated capability declaration it carries; the ungated reference read that resolves an identifier to the name QuickBooks holds for it, because no consumer may construct that request itself; the serverless-safe package surface; adoption by Cargo and Ledger with their local guard and adapter copies deleted.

**Out of scope, with reasons:**

| Excluded | Why |
|---|---|
| Cargo's invoice UI — upload, parse, reconcile, stage, approve, and the preview screen that renders the payload and writes nothing | Product surface, not shared infrastructure. It belongs to @REQ-CARGO-018 and its Work Orders. A package Requirement that specified a screen would mix levels. The preview screen, the bound approval, the adoption path and the posting route's execution budget are now written there, at AC-CARGO-018.6 through AC-CARGO-018.30 (Revision 4). |
| The bill mapping data — vendor aliases, QuickBooks account numbers, class references, payment terms | Cargo's domain data, per AC-KIT-010.9. The mapping is tenant-specific; putting it in a fleet package would pre-commit the shared layer to one brand's chart of accounts. |
| The split-invoice rule (bill the higher of two valuations) | Specified at AC-CARGO-018.3. It selects which invoice becomes a payload; the package receives the payload already chosen. |
| Cargo's creation of QuickBooks inventory items | Cargo originates SKUs and is therefore the normal writer of the Item entity under @REQ-KIT-012. **No Requirement authorizes that work, so this FRD does not specify it** — not the item's fields, not the SKU-to-item mapping, not the workflow identity that would hold the grant. It belongs to its own Requirement → Blueprint → Work Order chain. What this FRD does specify is the shape of the change that adds it: `createItem` joins the exposed write set (AC-KIT-012.10), a new Cargo identity enters the grant table with a normal grant, the gate-contract version increments (AC-KIT-012.11), and the partition test re-runs unchanged and still passes (AC-KIT-012.6, proven by the fixture test at AC-KIT-012.14). Revision 4's widening does not narrow that path: `createItem` is a write method no other system holds, so no partition criterion is disturbed by granting it. That is a declared capability change, not a re-architecture and not a violation of any AC here. |
| Migrating Ledger's other commands — expenses, categorization, reconciliation, month close, forecast, anomalies, margin, chase, tax-prep | Those entities originate in Ledger, so Ledger remains their normal writer under @REQ-KIT-012. Their **guards** are extracted with everything else — they dispatch through the package's guarded contract under identities whose grant sets name the update methods they dispatch and no create method (AC-KIT-008.35, AC-KIT-011.23, AC-KIT-012.29) — but their planning, learning and reporting logic stays in Ledger and is untouched. |
| Ledger's filesystem token driver, its capability differ, its hosted adapter, and its subprocess connector | Local-CLI concerns, and two of them cannot cross at all: the hosted adapter imports a filesystem module and the connector spawns a subprocess (AC-KIT-010.1, AC-KIT-010.3, AC-KIT-010.7). They stay in Ledger, built on the interfaces the package exports, and the hosted adapter is injected under AC-KIT-010.25 rather than exported. The self-hosted REST adapter is **not** in this row — it crosses under AC-KIT-010.21 and Ledger deletes its copy under AC-KIT-011.35. |
| Ledger's tenant-config file loader | Filesystem coupling that a serverless consumer cannot use. The package takes mapping as arguments (AC-KIT-010.9); each consumer loads its own. |
| Rotating or remediating the QuickBooks credentials currently exposed (see Known Risks) | A credential operation with a hard approval gate. It is named here so it is not lost, and tracked separately. |

## Known Risks

- **Git-tracked QuickBooks credentials — a tracked risk with an owner, not a prerequisite.** `unicorn-ceo/.mcp.json` is tracked in git and holds a QuickBooks client identifier, client secret, refresh token, and realm identifier as inline literal values (key names only recorded here; no value has been read or reproduced). Measured 2026-08-14: that file and Ledger use **different Intuit applications against the same production realm** — the same QuickBooks company. Two consequences, and they point opposite ways. Rotating the tracked credential does **not** invalidate Ledger's token, so it does not block this chain and is not a prerequisite for the first Cargo write; earlier text treating it as one is withdrawn. But it does write to the real books, so it is a live exposure with an owner and a date, not background. AC-KIT-009.16, AC-KIT-010.11 and AC-KIT-010.15 stop `@paver/qb` from repeating the pattern; they do not remediate this. Rotation is a separate operator-gated action.
- **One Intuit application, two products, one rotating credential.** Under D4 the token lock spans Cargo's serverless instances and Ledger's CLI. A driver graded only against processes of one product has not been graded against the contention that exists.
- **Version skew between consumers.** Git-tag pinning (@REQ-KIT-002) lets Cargo and Ledger sit on different `@paver/qb` versions, which is exactly the divergence this FRD exists to prevent, reintroduced through the distribution mechanism. AC-KIT-011.14 and AC-KIT-011.21 turn skew into a failing test inside each consumer's own repository; AC-KIT-011.22 keeps the human record.
- **The idempotency marker is written into the books.** AC-KIT-008.28 puts a Cargo-internal identifier into a QuickBooks field an accountant reads, and AC-KIT-012.23 through AC-KIT-012.25 add the provenance stamp to the same field. The alternative — no marker — leaves a retrying serverless function able to create a second real payable. Recorded so the format is chosen deliberately rather than discovered by an operator, and constrained by AC-KIT-008.40 so the composite field stays exactly matchable.
- **An outbound HTTP call is made while a database lock is held.** AC-KIT-009.3 requires it and this Requirement declines to soften it: a lock that does not span the exchange does not prevent the double-exchange that costs the whole connection. It is bounded by AC-KIT-009.22 (the common path takes no lock at all), AC-KIT-009.23 through AC-KIT-009.26 (the exchange is timed out and a timeout writes nothing), and AC-KIT-009.27 (nothing else goes out while the lock is open). It remains a smell that a reviewer should re-examine rather than inherit.
- **Two systems hold `createBill`.** D1 is a deliberate exception to one-normal-writer-per-write-method, and an exception with a name on it is still an exception. The controls are that the kinds are distinguishable in the table (AC-KIT-012.17), the paths are separately exported (AC-KIT-012.19, AC-KIT-012.20), the break-glass call refuses without a reason (AC-KIT-012.22), nothing inside the package falls back to it (AC-KIT-012.27), and every create says which identity and which kind made it (AC-KIT-012.23, AC-KIT-012.24). What the controls do not do is reduce the number of deployables that can be wrong from two to one.
- **The provenance stamp is evidence, not proof.** See Closed Question 4 — operator decision D4 accepts advisory provenance.
- **The crossing files import two modules both Blueprints keep in Ledger.** Measured 2026-08-14: `src/qb/adapters/self-hosted.ts:22-24` imports `declareCapabilities` and `AdapterCapabilities` from `../capabilities.js` and the `Adapter` type from `../router.js`, and `@blueprint:quickbooks-connector` ADR-008 states both files stay in Ledger. AC-KIT-010.21 requires the adapter to be exported and AC-KIT-010.24 puts everything it imports inside the walk of AC-KIT-010.4, so "the adapter crosses and those two do not" is not yet a coherent instruction — either the symbols the adapter needs cross with it, or the adapter is re-cut against symbols the package defines. This is a Blueprint and Work Order question, not a Requirements one: no criterion here names either file, and the walk of AC-KIT-010.4 fails loudly rather than silently if it is got wrong. Routed as R13. **CLOSED 2026-08-14 by `@blueprint:paver-qb-guarded-quickbooks-client` ADR-016**, and it needed no criterion, as this entry predicted: the adapter interface, the capability-declaration helper and the method-group dispatch cross with the adapter, while the routing map, the capability measurement and the hosted adapter stay in Ledger. AC-KIT-010.25 already obliged the package to accept a caller-supplied adapter for a method group, which is why the type surface had to cross whichever way R13 was decided.
- **One request shape means one release cycle for the file Ledger changes most.** A fix to line-detail construction now reaches Ledger only when Ledger bumps its pinned tag (AC-KIT-011.1), which is the version-skew risk above applied to the bytes rather than to the gates. AC-KIT-011.14 and AC-KIT-011.21 catch gate skew; they do not catch adapter skew, because the gate-contract version increments on gate behaviour (AC-KIT-011.14) and an adapter fix need not change a gate.

## Closed Questions

Revision 2 carried three open questions and Revision 3 carried four. All but one are now decided; the entries stay so each decision is readable where the question was asked.

1. **Ledger's break-glass bill path — CLOSED, operator decision D1, 2026-08-14.** Ledger keeps a break-glass `createBill` grant. Revision 2's AC-KIT-012.7 ("no create method to any Ledger identity") is replaced by a declared break-glass grant, and the partition is re-cut so the two kinds are distinguishable rather than merged. `@blueprint:paver-qb-guarded-quickbooks-client` ADR-003 and `@blueprint:cargo-container-blueprint` ADR-018 both need revising against this: ADR-003 grants Ledger `createBill` permanently but does not distinguish grant kinds, and ADR-018 states "Ledger does not keep a `createBill` grant. The grant moves; it is never held by both", which is now false. Routed to Boris.
2. **Which store backs the token driver, and whether Ledger shares it — CLOSED, 2026-08-14.** One Intuit application, one lineage, one shared row in Cargo's Supabase (`ezzfbtqcdyxxilpumzkw`), read by both consumers, per `@blueprint:paver-qb-guarded-quickbooks-client` ADR-002. The reachability half is settled by measurement, not assumption: the project has a working shared transaction pooler at `aws-1-us-west-2.pooler.supabase.com` — three IPv4 A records, ports 6543 (transaction mode) and 5432 (session mode) both verified open on 2026-08-14, no paid add-on. The earlier "no pooler on this project" conclusion was a hostname error: the prefix is `aws-1-`, not `aws-0-`, and every `aws-0-<region>` attempt returns a tenant-not-found error that reads like an absent pooler. The direct host `db.<ref>.supabase.co:5432` is IPv6-only and therefore unusable from Vercel. Consequences already cut into ACs: a transaction-scoped advisory lock is safe here and is what the design specifies; a session-scoped lock is not, and AC-KIT-009.28 fails a driver that leaves one held after its process exits; AC-KIT-009.29 requires the conformance suite to run over the production connection route, so a driver graded over a direct connection and shipped over the pooler is not graded. No "third database" fallback exists or is needed.

3. **The preview screen — CLOSED, 2026-08-14.** Written into @REQ-CARGO-018 at AC-CARGO-018.6 through AC-CARGO-018.9: the preview presents the exact payload, writes no Cargo record, sends no QuickBooks request, and shows when each account and class identifier it displays was last verified. `WO-CARGO-022`'s bootstrap declaration for the preview and for the bound approval is retired; its `karl-ac-preview-screen-K1` and `karl-ac-approval-binding-K2` blockers are satisfied.

4. **Attribution — CLOSED, operator decision D4, 2026-08-14. Advisory provenance, one Intuit application.** Two-application attribution is rejected. AC-KIT-012.23 through AC-KIT-012.26 stand as written and are understood as evidence rather than proof: the stamp is a value the package writes, so it attests to what the package did and not to what QuickBooks observed, and because both consumers authenticate as one Intuit application, QuickBooks' own audit trail names that application and cannot distinguish Cargo from Ledger. What the stamp buys is that an **unstamped** bill means "not created through `@paver/qb`" — the QuickBooks-UI path, recovered by AC-CARGO-018.19's adoption. The reasoning for accepting it: the only failure a second application would catch is a compromised consumer, and a compromised consumer holding the grant writes a truthful stamp anyway.

   The consequence must be stated plainly rather than left as an inference. **One application means one rotating refresh token, and that token is shared by both products.** The cross-process lock of @REQ-KIT-009 is therefore a **cross-product** lock: it must hold between Cargo's N serverless instances *and* Ledger's local CLI, which can exchange the same token from a laptop while a Cargo post is in flight. No AC in this FRD assumed otherwise — AC-KIT-009.5 grades contention across separate operating-system processes without naming a product, and AC-KIT-009.6, .7, .20 and .28 are properties of the driver, not of the caller — so nothing is re-cut for it. What was missing is the obligation to *run* that grading on each deployed driver, now AC-KIT-011.30 and AC-KIT-011.31. `WO-KIT-001`'s `operator-decision-attribution-OQ2` blocker is satisfied.

5. **The posting route's execution limit — CLOSED, 2026-08-14.** The consumer half of the budget is written into @REQ-CARGO-018 at AC-CARGO-018.25 through AC-CARGO-018.30, per `@blueprint:cargo-container-blueprint` ADR-023: a declared limit of at least 120 seconds whose deployed effective value is verified and recorded, a deadline computed at entry from which each step's timeout is derived, the token acquired before any QuickBooks request, no chart read at post time, a create timeout strictly inside the time remaining, and exhaustion ending as a recorded unknown routed to adoption rather than a retry. The package half remains AC-KIT-010.17 and AC-KIT-010.18.

6. **The adapter — CLOSED by measurement, 2026-08-14.** Cargo uses the self-hosted REST adapter, and there was never a second candidate. `config/tenants/madson/tenant.json:14` routes every Ledger method group at that adapter, and records why: the WO-006 capability diff found the hosted adapter cannot carry a per-line class reference on an item-based line, and every Madson bill line carries a brand class. The other adapter communicates by spawning a subprocess and cannot run on a serverless function. Any text in this chain implying Cargo might post through the hosted or subprocess path is wrong. AC-KIT-010.7 forbids the subprocess adapter; AC-KIT-010.20 now forbids exporting any adapter that cannot carry a per-line class, so AC-KIT-008.20's runtime refusal is not the only control.

## Open Questions

1. **`PrivateNote` filterability is unsourced.** AC-KIT-008.28 through AC-KIT-008.30 and AC-KIT-008.40 specify a marker written into a QuickBooks field and queried back. No document in this chain cites an Intuit API reference showing the chosen field is filterable, and CLAUDE.md's spec-first rule forbids specifying against an unconfirmed API shape. `WO-KIT-001` already carries this as a hard pause. The ACs are written against "a field QuickBooks returns on a read" rather than a named field so the Requirement survives the answer; if no returned field is filterable, AC-KIT-008.29 and AC-KIT-008.30 are unverifiable and must be re-cut against whatever the API does support — not shipped as a no-op.
2. **The exchange-intent record has no Requirement.** `WO-KIT-002` added AC 2 argues that `generation` and `rotated_at` cannot distinguish "we exchanged and lost the result" from "we never exchanged", because both are written inside the transaction that rolls back, and proposes a separately committed intent row. Karl agrees with the reasoning and declines to author the AC blind: whether Intuit honours a grace window for the prior refresh token is **unsourced** in this chain, and that answer decides whether the correct behaviour after a stranded intent is `ReauthorizationRequired` or a bounded retry. This is the same shape as Open Question 1 — an AC written against an unconfirmed API behaviour would be a guess wearing a modal verb. It needs the Intuit reference, then one AC in @REQ-KIT-009.

<!--
Karl's notes:

NUMBERING — REQ-KIT-007 was already taken.
  The task brief stated that REQ-KIT-007 existed only as a line in kit's README and that no
  Requirement document existed. That is incorrect. REQ-KIT-007 ("Remaining shared packages are
  named, not yet specified") is a real, Active Requirement in
  .paver/requirements/frds/REQ-KIT-001-shared-package-layer.md:101-108. AC-KIT-007.1 names
  @paver/qb among five deferred packages and states each "shall each receive their own Requirement,
  authored when a first consumer commits to adopting them, before any implementation Work Order
  opens." This FRD is the fulfilment of AC-KIT-007.1 for @paver/qb, not a replacement of
  REQ-KIT-007. Reusing the ID would have broken AC-KIT-007.2's citation and renumbered a shipped
  Requirement. Allocated the next free IDs instead: REQ-KIT-008 through REQ-KIT-012.

REVISION 2 — this file already existed when this unit began (untracked, authored earlier the same
  day), and `@blueprint:paver-qb-guarded-quickbooks-client` had already been written against it and
  routed seventeen Requirement defects back to Karl. Revising in place was the only correct move:
  a second document under a different ID would have orphaned every Blueprint citation and created
  the two-copies-of-the-rules failure this FRD exists to prevent. New AC ids are appended within
  their parent Requirement rather than inserted, so no previously written id changed meaning
  except the four listed below.

  Re-cut under an existing id (Boris must re-read these four):
    AC-KIT-008.15  widened from "total or line count" to "which field", now that vendor is checked.
    AC-KIT-008.19  gate order corrected to match vendor-bill.ts:1035-1057 (shape before capability);
                   AC-KIT-008.2 removed from the enumeration (it is structural, it does not "run").
    AC-KIT-009.6   re-assigned from "exactly one exchange" (a package property a driver cannot
                   control) to mutual exclusion (a driver property). The exchange-count criterion
                   moved to AC-KIT-009.18 on the package. Resolves Blueprint defect 2 / ADR-006.
    AC-KIT-011.2   now names the three modules by path instead of describing them, and
                   AC-KIT-011.15 states the replacement so a literal reading cannot delete a
                   working path with nothing specified to take its place. Resolves defect 13.

  Blueprint defects 1-17, disposition: 1→AC-KIT-009.17/.18 · 2→AC-KIT-009.6 re-cut, .21 ·
  3→AC-KIT-008.26 · 4→AC-KIT-008.22 · 5→AC-KIT-008.27 through .30, .33, .34 · 6→AC-KIT-008.19
  re-cut, .20, .21 · 7→AC-KIT-008.23 through .25 · 8→AC-KIT-008.32 · 9→REQ-KIT-012 ·
  10→AC-KIT-009.19 · 11→AC-KIT-009.16 reworded plus AC-KIT-010.15 · 12→AC-KIT-011.3, .9, .16-.20
  split into single-claim, grep-checkable criteria on the precedent of AC-KIT-004.2 ·
  13→AC-KIT-011.2, .15 · 14→AC-KIT-011.6 re-cut · 15→AC-KIT-011.14, .21, .22 · 16→AC-KIT-010.14,
  .16 · 17→Revision 3 Open Question 1, closed in Revision 4 as Closed Question 3 (it belongs to @REQ-CARGO-018, not to this file).

  Added beyond the routed defects: AC-KIT-008.31 (a truncated search read as an absence is the
  PostgREST-cap failure in QuickBooks clothing; Ledger already passes fetchAll:true at
  vendor-bill.ts:686-694 for exactly this reason, and no AC required it).

THE ENTITY PARTITION — REQ-KIT-012 is the operator's correction, and it changed the document's
  spine rather than adding a paragraph. Revision 1's Scope Boundary read "Cargo posts factory
  bills; Ledger owns everything else", which states a limit on Cargo. The rule is a partition of
  QuickBooks by entity type where the writer is the originating system, so Cargo creating
  inventory items later is Cargo doing its own job, not a scope expansion. Every place that
  sentence appeared is rewritten, and the Item deferral is recorded in the Scope Boundary as a
  deferral with its cost of entry named (AC-KIT-012.10, AC-KIT-012.11) rather than as an exclusion.

BOOTSTRAP MODE — not claimed, and does not need to be. REQ-KIT-001 declared bootstrap mode because
  no upstream existed. This FRD traces up to AC-KIT-007.1, so the authority chain is complete.

REVISION 3 — the backwards reconciliation. Revisions 1 and 2 were written forwards: Requirement,
  then Blueprint, then Work Orders. Nothing was reconciled backwards, so the Blueprint still
  specified things this Requirement had re-cut, and two operator decisions taken after the chain was
  written were recorded nowhere. This revision closes that.

  Re-cut under an existing id (Boris and Foreman must re-read these seven):
    AC-KIT-011.2   adds src/qb/guarded.ts to the deletion list. Deleting the three modules without
                   it is incoherent: guarded.ts imports all three (guarded.ts:4-6) and would not
                   compile. Deleting all four without a replacement is worse — see the next entry.
    AC-KIT-011.15  was the declared orphan no Work Order could claim, because it required Ledger to
                   create through the guarded path while AC-KIT-012.7 granted Ledger nothing.
                   Operator decision D1 dissolves the contradiction: re-cut to the BREAK-GLASS
                   path, and it is now claimable by WO-026. The orphan is claimed, not deleted.
    AC-KIT-011.21  was one id covering two repositories, honestly declared as split across WO-026
                   and WO-CARGO-023. Split into AC-KIT-011.21 (Ledger) and AC-KIT-011.27 (Cargo),
                   so exactly one Work Order claims each and both can legally leave open/.
    AC-KIT-012.3   "exactly one consumer system" → "no more than one", for a NORMAL grant. See the
                   contract.ts ruling below — the premise WO-KIT-001 relied on is false, and D1
                   makes the point moot anyway: two systems now hold createBill legitimately.
    AC-KIT-012.5   now says "normal grant" rather than "grant".
    AC-KIT-012.6   was "the grant table shall grant no create method other than createBill to any
                   Cargo identity" — an absolute that made Cargo's next entity a violation of a
                   shipped AC. Operator decision D2. Re-cut from freezing the CURRENT ASSIGNMENT to
                   constraining the SHAPE OF A GRANT CHANGE: the partition test must pass unchanged
                   when a grant set grows. The invariant that survives is AC-KIT-008.1 + .008.2 +
                   AC-KIT-012.1 — no UNGRANTED create method may be called, over a per-consumer
                   grant set the table owns.
    AC-KIT-012.7   was "no create method to any Ledger identity". Operator decision D1: a declared
                   break-glass grant of createBill.

  Added, by decision:
    D1 (Ledger keeps break-glass)  AC-KIT-012.16, .17, .18, .19, .20, .21, .22, .23, .24, .25,
                                   .26, .27, .28 · AC-KIT-011.26 (Cargo may not import it) ·
                                   AC-KIT-008.40 (the marker stays exactly matchable when the
                                   provenance stamp shares its field)
    D2 (Item survivability)        AC-KIT-012.13, .14, .15 — the extensibility is itself testable:
                                   the partition check becomes a function over a SUPPLIED table,
                                   and a fixture table carrying a create method the shipped table
                                   does not have must pass. A checker hard-coded to createBill
                                   fails that fixture. This is the AC the brief asked for.
    D3 (pooler measured)           AC-KIT-009.28 (a lock still held after its holder exits fails —
                                   this is what a session-scoped lock on a pooled connection looks
                                   like), AC-KIT-009.29 (grade the driver over the production
                                   connection route, or the grade means nothing)
    Finding 1 (the non-create      AC-KIT-008.35, .36, .37, .38, .39, .41, .42 · AC-KIT-011.23,
    guards have no home)          .24, .25
    Finding 9 (lock across HTTP)   AC-KIT-009.22, .23, .24, .25, .26, .27 · AC-KIT-010.17, .18, .19

CONTRACT.TS COMES ACROSS WHOLE — the one decision four documents each answered differently.
  WO-KIT-001's In Scope table moves src/qb/contract.ts as "already pure"; its added-AC 2 argues
  AC-KIT-012.3 is implementable as "exactly one" because createJournalEntry is "on Ledger's
  contract, not on the package's exposed create set". Both cannot hold: contract.ts:312 declares
  createJournalEntry and :334 lists it in CONTRACT_METHODS, so moving the file moves the method.
  The ruling is WHOLE, and it follows from finding 1 rather than from convenience. Ledger's
  reconcile and expense-review write through GuardedContract, which needs updateBill,
  updateBillPayment, updatePurchase, the searches and the reports. A trimmed contract cannot carry
  the guarded surface those workflows need, so trimming forces the guards back into Ledger — the
  drift. Consequences, all now written: createJournalEntry IS on the package's exposed create set,
  granted to nobody (AC-KIT-012.28 makes an ungranted-but-legal method explicit), so "exactly one"
  would fail a correct table and AC-KIT-012.3 is "no more than one". Boris's cargo-container
  ADR-018 §1 was right; WO-KIT-001's added-AC 2 was reasoning from a false premise and must be
  withdrawn.

THE GRANT TABLE IS SINGULAR, AND THAT IS WHAT SOLVES FINDING 1. The alternative on the table was
  the package exporting the approval-hash and write-verify functions standalone, which the component
  blueprint's "exports no raw contract surface" line forbids. Rejected: raw functions are a second
  way to write, and a consumer holding them holds a gate it can forget to call. The decision instead
  is that the package exports the whole GUARDED CONTRACT, and that Ledger's non-create workflow
  names become consumer workflow identities in the package's table with EMPTY create-grant sets —
  which is exactly the structure creation-policy.ts:41-54 already uses to grant createBill to one
  workflow and [] to eleven others. It is not new vocabulary; it is the existing vocabulary, re-homed.
  (SUPERSEDED IN PART BY REVISION 4: the empty-create-set idiom was the defect. Those identities now
  hold grant sets naming updateBill, updateBillPayment and updatePurchase — AC-KIT-012.29 — because
  an empty set that still permitted an update authorized nothing while appearing to authorize
  everything it allowed.)
  Ledger keeps NOTHING local, so there is no drift to argue about. `@blueprint:paver-qb-guarded-
  quickbooks-client` ADR-003's decision that "Ledger's other eleven workflow names stay in Ledger's
  own creation-policy" is superseded — it cannot survive AC-KIT-011.2 deleting that file — and its
  Key Contract "The package exports no raw contract surface" must be re-cut to "no UNGATED contract
  surface", which is AC-KIT-008.39. Routed to Boris.

ACs I consider hardest to verify:
  - AC-KIT-009.5/.6/.7/.20 (cross-process lock). Machine-checkable but expensive: the test has to
    spawn real processes against a real shared store and control the interleaving. A driver that
    passes a single-process test proves nothing about the failure this Requirement exists to
    prevent, which is why the criterion says "across separate operating-system processes" rather
    than "concurrently".
  - AC-KIT-008.12 (figures derived only from the re-read). Verified with a stub adapter whose
    create response deliberately disagrees with its fetch response; assert the reported figures
    match the fetch. Without that disagreement the test passes for the wrong reason.
  - AC-KIT-008.24 (no re-derivation between approval and dispatch). This is the one gate whose
    absence is invisible: a consumer that re-derives lines after approval passes every hash
    criterion while the approval covers nothing. It is testable only through AC-KIT-008.23 — the
    package builds the plan, so there is no seam to re-derive at — which is why .23 and .24 are
    written as a pair. An implementation that satisfies .24 by convention rather than by
    construction should be rejected in review.
  - AC-KIT-010.4 (import-graph walk). Straightforward to write and easy to write uselessly — it
    must walk the built output's transitive graph, not grep the source directory, or a re-export
    slips a filesystem import past it.
  - AC-KIT-008.31 (truncated search). Needs a stub adapter that returns a truncation signal; if the
    adapter cannot express truncation, the AC is unverifiable and the adapter is the defect.
  - AC-KIT-012.27 (nothing in the package invokes the break-glass path). Verified by a call-graph
    or import-graph assertion over the package's own built output — legitimate, because the package
    owns both modules and reads nothing outside itself. A grep of source is not enough for the same
    reason AC-KIT-010.4 walks the built graph.
  - AC-KIT-009.27 (no other outbound request while the lock is open). Needs a stub driver whose
    withLock records every outbound request made between acquire and release, and an injected
    transport that reports to it. Without the recording seam the AC is prose.
  - AC-KIT-009.28 (a lock outliving its holder). The suite must kill a real child process mid-lock
    and assert a second process acquires. A test that releases the lock politely proves nothing —
    it is the impolite exit that distinguishes a transaction-scoped lock from a session-scoped one.
  - AC-KIT-012.14 (the extensibility fixture). Easy to write uselessly: if the fixture's create
    method is one the shipped table already carries, the test passes against a hard-coded checker
    and the AC is decoration. The fixture's method must be absent from the shipped table.
  - AC-KIT-012.26 (unstamped bill reported unverified). Verified with a stub whose fetch response
    strips the stamp the create wrote. Note the limit recorded at Closed Question 4: this proves the
    package reads the stamp back, not that the stamp is trustworthy.

DECLARED DEFECT — AC-KIT-011.22 is the one AC in this FRD that does not reduce to a signal in
  CLAUDE.md's Verification protocol table. Its verification is "an entry exists in the drift log",
  which is process, not a passing gate. It earns its place as the human record of what changed:
  AC-KIT-011.14 and AC-KIT-011.21 already make skew a red test inside each consumer's own
  repository, so the machine-checkable half of revision 1's declared defect is now covered and only
  the narrative half remains. Modal verb is `should`, not `shall`, for that reason.

  AC-KIT-011.6 is a near-miss worth naming rather than hiding. "Count of test cases defined" had no
  computable definition, so it is re-cut as a checked-in expected file count. That is checkable
  (`node --test` reports files and tests run) but it is a count a contributor maintains by hand, so
  it degrades to a stale number rather than to a false green. It earns its place because the
  failure it guards against — a runner glob silently matching fewer files than exist and printing
  `fail 0` — is a recorded fleet incident (Shuttle 2026-08-09, CLAUDE.md §Verification protocol),
  and a hand-maintained count that goes red on a missed update is strictly better than a runner
  that goes green on a missed file.

REVISION 4 — the authorization widening, and the six owed ACs.

  THE DEFECT. Revision 3 solved "Ledger's guards have no home" by exporting the whole guarded
  contract to both consumers, and did not widen the grant vocabulary to match. Authorization stayed
  create-only while the contract went write-wide. Concretely: AC-KIT-008.36 required a token to be
  PRESENT on every write method; AC-KIT-008.37 refused only an ungranted CREATE; all of REQ-KIT-012
  was written over create methods. So `cargo-factory-bill`, whose grant set is exactly
  ['createBill'], held a token that satisfied .008.36 on `updateBill`, `updateBillPayment` and
  `updatePurchase`, and no criterion refused it. Cargo's negative ACs did not cover it either:
  AC-KIT-011.19 forbids calling createBill directly and AC-KIT-011.20 forbids comparing totals;
  neither mentions a non-create write.

  This is my defect, not an inherited one. The empty-create-set idiom at creation-policy.ts:41-54
  expressed "may update, may create nothing", and it was sound while all twelve identities lived in
  one trusted local CLI process — the process boundary was the authorization boundary, so the only
  question worth asking was "may this workflow create". Revision 3 put a second product's serverless
  identity in that table and imported the semantics without re-examining the premise. "May update"
  then spanned a product boundary and nothing in the document recorded the widening. The tell was
  visible in the title: "every QuickBooks entity type has one normal writer", a rule stated over
  entities and enforced over creates.

  THE FIX, and why it is a widening rather than a patch. The alternative was a non-create clause on
  .008.37 plus one Cargo negative AC. Rejected: it leaves two vocabularies in one table — a
  create-method rule block and a non-create rule block — and a future author adding a write method
  has to know which block to extend. That is the two-copies-of-the-rules failure this FRD exists to
  prevent, at the Requirements layer. The grant set is now a WRITE-method set, one vocabulary, and
  every partition criterion is stated over write methods.

  Re-cut under an existing id — MECHANICAL create→write widening, same id, same intent, wider
  subject. Boris and Foreman must re-read these, and every verbatim citation of them must be
  re-synced (WO-KIT-001 quotes .12.1 through .12.28 verbatim at :225-252):
    REQ-KIT-012 title and User Story   "entity type" → "write method", with the reason stated inline.
    AC-KIT-012.1    grant table maps identities to sets of WRITE methods.
    AC-KIT-012.3    the one-normal-writer rule, per WRITE method.
    AC-KIT-012.16   the break-glass counterpart, per WRITE method.
    AC-KIT-012.18   no system holds both kinds, per WRITE method.
    AC-KIT-012.6    a grant set growing by a WRITE method leaves the partition test passing.
    AC-KIT-012.8    the capability gate is asserted on every WRITE method exposed.
    AC-KIT-012.9    the ungranted-token test runs over every exported WRITE path.
    AC-KIT-012.10   the declared, grant-drawable set is the WRITE set.
    AC-KIT-012.11   the version bump triggers on gaining a WRITE method.
    AC-KIT-012.14   the extensibility fixture uses a WRITE method absent from the shipped table.
    AC-KIT-012.15   the two-system violation fixture normal-grants a WRITE method.
    AC-KIT-012.28   an ungranted-but-declared WRITE method is legal; updateJournalEntry joins
                    createJournalEntry as a case that exists today.
    AC-KIT-010.11   the realm identifier is REMOVED from the caller-supplied configuration values.
                    It is read from the token record (AC-KIT-009.32, .33). This is the only re-cut
                    in Revision 4 that narrows rather than widens, and it is the realm-binding fix.

  Deliberately NOT re-cut, and the reason:
    AC-KIT-008.36   already reads "every write method it exposes". It was never the defect; it was
                    the half of the pair that made the defect invisible, because a token being
                    PRESENT looked like a token being CHECKED.
    AC-KIT-008.37   remains true as written — creates are a subset of writes. Widening it in place
                    would have broken a verbatim citation for no gain. AC-KIT-008.43 covers the
                    complement and AC-KIT-008.44 forbids the exemption that caused this.
    AC-KIT-012.5, .7, .17, .19-.27  break-glass and provenance are create-shaped by design; a
                    non-create break-glass has no case today, and AC-KIT-012.30 makes it explicit
                    that a non-create write does not touch the stamp rather than leaving it silent.

  Added, by defect:
    Authorization       AC-KIT-008.43 (refuse an ungranted NON-CREATE write — the hole) ·
                        AC-KIT-008.44 (membership in the grant set is the whole decision; no write
                        method is exempt for not being a create — this is the root cause, the
                        `if (!isCreation(method)) return` early exit at creation-policy.ts:81) ·
                        AC-KIT-012.29, .31, .32 (Ledger's normal grants of updateBill,
                        updateBillPayment and updatePurchase, one AC each on the AC-KIT-012.5/.7
                        precedent, so `reconcile` and `expense-review` still work — WITHOUT THESE
                        THE WIDENING WOULD BREAK THE TWO WORKFLOWS IT EXISTS TO PROTECT, because a
                        grant set that authorized nothing would now refuse everything) ·
                        AC-KIT-012.30 (a non-create write does not modify the provenance field) ·
                        AC-KIT-011.28, .29 (the Cargo negative and its repo-local assertion)
    karl-ac-shared-driver       AC-KIT-009.30, .31
    karl-ac-consumer-runs-suite AC-KIT-011.30 (Cargo), AC-KIT-011.31 (Ledger), split one-per-repo on
                        the AC-KIT-011.21/.27 precedent so exactly one Work Order claims each ·
                        AC-KIT-011.32, .33, .34 (neither consumer defines its own driver)
    karl-ac-realm-from-record   AC-KIT-009.32, .33 + the AC-KIT-010.11 re-cut above
    Adapter (measured)  AC-KIT-010.20

  D2 IS INTACT, and I checked it rather than asserting it. The invariant AC-KIT-012.6 protects is
  "adding a method to a grant set later must still not violate any AC". Under the widening: adding
  `createItem` to a new Cargo identity adds a write method no other system holds, so .12.3, .12.16
  and .12.18 all still hold, .12.4's test passes unmodified, and .12.14's fixture — which must use a
  method ABSENT from the shipped table — is unaffected because it was never createBill-specific.
  Nothing added in Revision 4 names Cargo's permissible methods, which is the mistake Revision 3
  had to undo in .12.6. The one new constraint Cargo acquires is that it may not take a NORMAL grant
  of `updateBill`, `updateBillPayment` or `updatePurchase`, because Ledger holds those (.12.29) —
  and that is the partition working, not a limit on Cargo's own entities.

  THE PARTITION IS NOW FINER THAN ENTITY TYPE, and that is a real change to what the Requirement
  claims. A Bill has a normal creator (Cargo) and a normal updater (Ledger). Under the old title
  that reads as two writers of one entity. It is not: the rule that protects the books is that no
  record is BORN in two places, and the create half still enforces exactly that. What the write-level
  rule adds is that no product can quietly modify what another product owns — which the entity-level
  rule never enforced, because it was never checked. Boris must re-cut #GuardedWriteDispatcher's
  responsibilities against this: the dispatcher's authorization step is no longer "is this a create,
  and if so is it granted" but "is this method in the token's grant set", with no branch on method
  kind. See R1 below.

REVISION 6 — the read, and the date on the adapter's declaration.

  TWO GAPS, BOTH THE SAME SHAPE: a gate that refuses everything, for a reason no criterion names.

  GAP ONE — the closed path. AC-CARGO-018.48 (Cargo reads the identifier from QuickBooks before
  saving a mapping record) and AC-KIT-011.42 (no Cargo source file constructs an Accounting API
  request) were written in the same chain, one revision apart, and the package exports no read.
  AC-KIT-011.41 and .43 close the two ways around it. So Cargo's mapping verifier could not do its
  job by any permitted path, and the mapping lifecycle AC-CARGO-018.49 through .52 hangs off a read
  that could not happen. Boris decided the mechanism at ADR-015 — the package exports the read —
  and I have written the criterion he owed plus the eight that make it testable rather than
  gestural. AC-CARGO-018.48 is re-cut in the Cargo FRD to route through it.

  WHY BY IDENTIFIER AND NOT BY NAME (AC-KIT-010.31). The contract already carries name-shaped
  searches. None of them satisfies AC-CARGO-018.48: an account name on a transaction is fully
  qualified while a search returns the leaf, and leaf names collide ([[quickbooks-api-gotchas]]).
  A verifier that searched by name would confirm a mapping against the wrong account and stamp a
  verification date on it — the exact failure AC-CARGO-018.35 exists to prevent, performed by the
  control meant to prevent it. The read takes the identifier and asks QuickBooks what it is.

  WHY A FAILED READ IS NOT AN ABSENCE (AC-KIT-010.33). Same rule as AC-KIT-008.31 for the duplicate
  probe, and the same rule CLAUDE.md states about a structural zero: an error and a genuine "nothing
  here" are different facts, and collapsing them reports the second one in the reader's favour.
  Without .33, a network failure at mapping-edit time refuses the save under AC-CARGO-018.49 and
  reads to an operator as "QuickBooks says that identifier does not exist" — and the mirror failure,
  a read error treated as success, is worse. The Cargo half is AC-CARGO-018.63.

  WHAT THE READ DELIBERATELY DOES NOT SAY. The wire form. ADR-015 item 4 hands the API shape to the
  Work Order under CLAUDE.md's spec-first rule, and I have kept the criteria on the semantics —
  identifier in, name-or-nothing out — so a builder who confirms a read-by-identifier endpoint and a
  builder who confirms a filter query both satisfy the same criteria. An AC naming the endpoint
  would be a guess wearing a modal verb, which is the Open Question 1 mistake one file over.

  GAP TWO — the adapter that refuses every create. AC-KIT-008.21 refuses a create when the receiving
  adapter's capability declaration carries no measurement date. The adapter AC-KIT-010.21 obliges the
  package to export declares `measuredAt: null` (`self-hosted.ts:316`, defaulted at
  `capabilities.ts:69`). Ledger does not meet the refusal because its own gate falls back to a
  by-construction exemption set (`vendor-bill.ts:630-658`). Nothing obliged the exported adapter to
  carry a date, and nothing forbade the package acquiring the same exemption — so the chain as
  written shipped an adapter that refuses every create, or a package that quietly stops measuring.
  AC-KIT-010.26 is the obligation; AC-KIT-010.27 is the fence, on the AC-KIT-008.22 precedent (a
  gate with an exemption is a gate with an off switch). Boris found this reading his own ADR-014 and
  called it a defect in the ADR rather than in a Work Order; he is right, and it is the same failure
  shape as the missing item mapping — a gate refusing everything for an unnamed reason.

  D2 IS INTACT, checked again. AC-KIT-010.30 names four reference kinds and is a floor, not a closed
  set: it says which kinds the read shall resolve, not which kinds exist, so a fifth costs nothing.
  Nothing added here names a write method, a grant or a written entity. The grant table is untouched,
  AC-KIT-010.35 adds no grant for the read (a read is not a write method, per Terminology), and
  AC-KIT-012.14's fixture passes unmodified. Adding `createItem` to a Cargo identity later still
  violates no criterion in this file.

  Added (eleven; no existing id changed meaning):
    karl-ac-dated-declaration  AC-KIT-010.26 (the exported adapter's declaration carries a
                        measurement date) · .27 (the package holds no exemption from AC-KIT-008.21).
                        Closes the Revision-4 defect Boris routed at ADR-014.
    karl-ac-reference-read     AC-KIT-010.28 (the package exports a read that resolves a reference
                        from an identifier) · .29 (it returns the name QuickBooks holds) · .30 (it
                        resolves an account, a class, an item and a vendor) · .31 (it accepts no
                        name as the value it resolves) · .32 (it reports an identifier that resolved
                        to nothing) · .33 (a failed read is not that report) · .34 (it dispatches
                        through the same adapter surface a write does) · .35 (it requires no
                        capability token) · .36 (it takes its token from @REQ-KIT-009's custody, so
                        there is no second credential path). Closes ADR-015's owed criterion.
    Non-AC edits: the Revision-6 header line, and the R13 Known Risks entry marked closed by
    ADR-016. Total AC count in this FRD moves 178 → 189.

  ROUTED OUT (Revision 6).

  To Foreman (Andrew Taylor):
    R20 Eleven new ACs need claiming: AC-KIT-010.26 and .27 (the dated declaration and its fence —
        WO-KIT-001 is the natural owner, it already claims .21 through .25) and AC-KIT-010.28
        through .36 (the reference read — also WO-KIT-001 on the package side). Allocation is
        Foreman's. The consumer half is AC-CARGO-018.48 re-cut, which WO-CARGO-021 quotes verbatim
        at line 114 and must re-sync.
    R21 AC-KIT-010.36 makes the reference read a consumer of the token custody of @REQ-KIT-009. So
        the mapping-edit surface is blocked on custody being wired — WO-CARGO-020 — and not only on
        this revision landing. That is a `blocked-by` edit, not a scope edit.
    R22 AC-KIT-010.27 forbids the package holding a by-construction exemption from AC-KIT-008.21.
        Any Work Order In Scope row that carries `PER_LINE_CLASSREF_BY_CONSTRUCTION` across with the
        gate is now against a criterion rather than only against an ADR.

  STILL OPEN, still not guessed: Open Question 1 (`PrivateNote` filterability) and Open Question 2
  (what a stranded exchange intent does). Both need the Intuit reference. Neither moved this
  revision, and AC-KIT-010.28 through .36 are deliberately written so that neither answer changes
  them — the reference read resolves a reference by identifier and has nothing to do with querying a
  bill by a marker.

REVISION 5 — the adapter has a Requirement.

  THE GAP. Revision 4 closed `karl-ac-shared-driver` for token custody: AC-KIT-009.30 and .31 made
  the shared driver a Requirement instead of a Blueprint aside. The identical gap was left open one
  layer down. `@blueprint:paver-qb-guarded-quickbooks-client` ADR-014 and
  `@blueprint:quickbooks-connector` ADR-008 both decided — by measurement, and correctly — that
  `self-hosted.ts` and `rest-client.ts` cross into the package. No AC said the package exports an
  adapter, no AC deleted Ledger's copy, and no AC forbade Cargo writing its own. Read literally, the
  Requirement in force before this revision permitted a Cargo builder to write a second QuickBooks
  REST client and ship it: AC-KIT-011.19 forbids calling `createBill` directly and AC-KIT-011.28
  forbids a non-create write, but the adapter is neither — it is the thing the guarded contract
  calls, one layer below both. The result would have been shared gates and unshared bytes, which is
  the drift this FRD exists to end, relocated rather than removed.

  THE NEGATIVE IS THE HALF THAT WORKS. AC-KIT-010.21 alone would not have prevented anything: a
  package exporting an adapter and a consumer writing another are not in conflict, and the second
  one arrives the first time the contract lacks a field somebody needs on a Friday. AC-KIT-011.41,
  .42 and .43 are the criteria that refuse it, on the AC-KIT-011.16-.20 precedent — one claim each,
  greppable, asserted by a test that reads nothing outside Cargo's own repository (AC-KIT-011.44).

  WHY "QUICKBOOKS ACCOUNTING API" AND NOT "HTTP CLIENT". A criterion forbidding a Ledger or Cargo
  file to send an HTTP request to a QuickBooks host would be false on arrival: `hosted.ts:191`
  addresses `https://ai-inc.quickbooks.intuit.com/v1/mcp`, which is a QuickBooks host and which
  AC-KIT-010.1 and AC-KIT-010.7 keep in Ledger deliberately. The discriminator is the interface, not
  the hostname: `rest-client.ts:59,67` builds `/v3/company/{realm}` paths with a `minorversion`
  query parameter, and the hosted and subprocess connectors speak neither that path shape nor that
  interface. Hence the Terminology entry and AC-KIT-011.39 / .42 as written. A reviewer who narrows
  these to a hostname re-opens the hole; a reviewer who widens them to "HTTP" makes them unmeetable.

  WHAT KEEPS THE MCP ADAPTER OUT. Three criteria, none of them new: AC-KIT-010.3 (nothing reachable
  from a public entry point imports `node:child_process`), AC-KIT-010.7 (no exported adapter
  communicates by spawning a subprocess), and now AC-KIT-010.22 (at most one adapter that sends).
  AC-KIT-010.20 is untouched and still forbids exporting any adapter that cannot carry a per-line
  class, which is what disqualifies the hosted path for every Madson bill. AC-KIT-010.21 is written
  as "a QuickBooks adapter", not as a named file, so it cannot be read as authorizing a second one.

  AC-KIT-010.25 IS NOT A LOOPHOLE, and I checked it rather than asserting it. It permits a consumer
  to supply an adapter, which is exactly what Ledger does with its hosted adapter for any group it
  routes there (`@blueprint:quickbooks-connector` ADR-004, ADR-008) and what AC-KIT-011.38 requires
  so the deletion does not silently remove Ledger's routing choice. It is closed on the Cargo side
  by AC-KIT-011.43 — Cargo supplies no adapter at all — and on the definition side by
  AC-KIT-011.41. A consumer-supplied adapter is still gated: it is reached through the guarded
  contract, so AC-KIT-008.36 and AC-KIT-008.39 hold over it unchanged.

  D2 IS INTACT, checked again under this revision. Nothing added here names a method, a grant or an
  entity, so adding `createItem` to a Cargo identity later still violates no criterion:
  AC-KIT-012.14's fixture is untouched, the write-method grant vocabulary is untouched, and the four
  new Cargo negatives are about the transport layer, not about what Cargo may write.

  Added, by defect (fifteen; no existing id changed meaning):
    karl-ac-shared-adapter  AC-KIT-010.21 (the package exports one) · .22 (no more than one that
                        sends) · .23 (it uses the injected transport) · .24 (it is reachable from a
                        public entry point, so AC-KIT-010.4's walk covers it and .1-.3 hold over
                        everything it imports) · .25 (a consumer may still supply one) ·
                        AC-KIT-011.35 (Ledger deletes both files) · .36 (nothing imports them) ·
                        .37 (Ledger obtains it from the package) · .38 (Ledger injects the adapter
                        it keeps, so the routing choice survives) · .39 (no Ledger file builds an
                        Accounting API request) · .40 (Ledger asserts it) · .41 (no Cargo file
                        defines an adapter) · .42 (no Cargo file builds an Accounting API request) ·
                        .43 (no Cargo file supplies an adapter) · .44 (Cargo asserts it)
    Non-AC edits: the Overview's adapter paragraph, two Terminology entries (QuickBooks adapter,
    QuickBooks Accounting API), the Scope Boundary's in-scope line and its Ledger-keeps row, and two
    Known Risks entries. Total AC count in this FRD moves 163 → 178.

  ROUTED OUT (Revision 5).

  To Boris (Architect):
    R13 The crossing is not yet coherent at the symbol level, and it is his to resolve.
        `self-hosted.ts:22-24` imports `declareCapabilities` and `AdapterCapabilities` from
        `capabilities.js` and the `Adapter` type from `router.js`; ADR-008 keeps both files in
        Ledger. AC-KIT-010.24 puts everything the exported adapter imports inside AC-KIT-010.4's
        walk, so either those symbols cross, or the adapter is re-cut against symbols the package
        defines, or the package re-exports them. Requirements are silent on which by design — this
        is a Blueprint decision, and AC-KIT-010.4 fails loudly if it is got wrong. It is also the
        second half of the ITEM 3 disagreement Foreman is holding.
    R14 `@blueprint:cargo-container-blueprint` ADR-019 now has its Requirement: AC-CARGO-018.31
        through .56 in `brands/madson-co/.paver/requirements/cargo-frd.md`. Its four qualifications
        map as: identity-is-the-id → .34 and .35; one source of truth → .31 plus the Ledger note in
        R15; no default account or class → .38 and .39; verified before use → .48 through .52. Read
        them against the ADR before the next drift review. Where the ADR names `qb_account_map` and
        `qb_class_map`, the Requirement says "mapping record" and names no table, because table
        shape is his — and because the payload also carries an **item** identifier per the retired
        skill's item-based line (AC-CARGO-018.40), which neither of the ADR's two tables holds. The
        SKU-to-item mapping has no home in ADR-019 and needs one; @REQ-KIT-008's Scope Boundary
        excludes Cargo *creating* items, not mapping a SKU to an item that exists.
    R15 ADR-019 item 2 states that Ledger's break-glass bill path reads Cargo's mapping tables after
        migration, which gives Ledger a runtime dependency on Cargo's database that **no AC
        requires**. This is the same shape as the gap this revision just closed and I am not
        authoring it blind: whether Ledger's break-glass path resolves mapping from Cargo's store or
        from a payload the operator supplies is a design decision with an operator cost (a
        break-glass path that needs Cargo's database is unavailable exactly when Cargo is). It needs
        one decision, then one AC in @REQ-KIT-011. Named here so it is not lost.

  To Foreman (Andrew Taylor):
    R16 Fifteen new ACs need claiming: AC-KIT-010.21, .22, .23, .24, .25 · AC-KIT-011.35, .36, .37,
        .38, .39, .40, .41, .42, .43, .44. Likely owners: WO-KIT-001 (010.21-.25), WO-026
        (011.35-.40), WO-CARGO-020 or -023 (011.41-.44) — allocation is Foreman's, not Karl's.
    R17 The ITEM 3 file-home disagreement is now decidable on the Requirements side and only there:
        AC-KIT-011.35 says `self-hosted.ts` and `rest-client.ts` leave Ledger, so any WO-026 In
        Scope row keeping them is stale. `capability-differ.ts`, `router.ts` and `capabilities.ts`
        are **not** named by any AC in this FRD and the Scope Boundary keeps the capability differ
        in Ledger; WO-KIT-001's In Scope rows moving them have no Requirement behind them and are
        Boris's R13 to settle before a builder reads either file list.
    R18 Twenty-six new ACs in the Cargo FRD need claiming: AC-CARGO-018.31 through .56. They are
        the mapping half of WO-CARGO-021's `bootstrap-operator-approval`; with AC-CARGO-018.2
        re-cut, that declaration has no remaining subject in @REQ-CARGO-018. Two consequences for
        the Work Orders: WO-CARGO-021 now needs a migration for the mapping records and an admin
        surface it did not carry, and any WO citing AC-CARGO-018.2 verbatim must re-sync — the
        criterion no longer names a parser or an external skill file.
    R19 AC-CARGO-018.3 is SHIPPED and I did not touch it, but its tail still reads "consistent with
        the split-invoice rule in the vendor-bill-automation skill". The rule it states is complete
        without the citation (bill the higher-value invoice), so nothing is unverifiable today; the
        citation goes stale the moment that file is archived. It is a one-line drift-review item,
        not a defect, and it is deliberately not fixed in a revision whose promise was that .1
        through .30 are unchanged.

ROUTED OUT OF THIS DOCUMENT (Revision 4).

  To Boris (Architect):
    R1  #GuardedWriteDispatcher needs re-cutting. Its authorization responsibility must lose the
        create/non-create branch entirely: one membership test over the token's grant set, applied
        to every write method (AC-KIT-008.43, .44, AC-KIT-012.8, .9). Any block or ADR describing
        the capability gate as a creation gate is now wrong. The component blueprint's
        #CreationPolicy-derived naming should follow — a "creation policy" that authorizes updates
        is a name that will re-teach the defect.
    R2  Every ADR stating the partition over entity types must be re-cut to write methods:
        @blueprint:paver-qb-guarded-quickbooks-client ADR-003, ADR-011, ADR-012, and
        @blueprint:cargo-container-blueprint ADR-018. ADR-018's provenance paragraph is unaffected.
    R3  Any ADR or block implying Cargo could reach QuickBooks through the hosted or MCP adapter is
        wrong and must be corrected. Ledger routes every group at the self-hosted REST adapter
        (config/tenants/madson/tenant.json:14) because the hosted adapter cannot carry a per-line
        ClassRef on an item-based line, and the MCP adapter spawns a subprocess. Closed Question 6.
    R4  ADR-002's attribution discussion is closed by D4: advisory provenance, one Intuit
        application, two-application attribution rejected. The consequence to write into the ADR is
        that the token lock is cross-PRODUCT, not merely cross-process.
    R5  The Known Risks entry on the git-tracked credential is downgraded from prerequisite to
        tracked risk: the tracked file and Ledger use DIFFERENT Intuit applications against the SAME
        production realm, so rotating it does not invalidate Ledger's token and does not gate the
        first Cargo write. ADR-020's "rotation precedes the first production write" is withdrawn.

  To Foreman (Andrew Taylor):
    R6  WO-KIT-001 quotes AC-KIT-012.1 through .28 verbatim at :225-252 and AC-KIT-010.11 in its
        configuration scope. Fourteen of those quotations are now stale. Re-sync before the
        coherence re-check, or the verbatim-match count will report failures that are this
        revision's, not the Work Order's.
    R7  WO-KIT-002's blockers `karl-ac-shared-driver` and `karl-ac-consumer-runs-suite` are
        SATISFIED — AC-KIT-009.30/.31 and AC-KIT-011.30/.31. Its Requirement line is no longer
        `NONE`; the bootstrap declaration for those two gaps is retired.
    R8  WO-CARGO-020's blockers `karl-ac-consumer-runs-suite` and `karl-ac-realm-from-record` are
        SATISFIED — AC-KIT-011.30 and AC-KIT-009.32/.33.
    R9  WO-KIT-001's blocker `operator-decision-attribution-OQ2` is SATISFIED by D4. Its remaining
        blocker `spec-first-privatenote-OQ3` stands.
    R10 WO-CARGO-022's blockers `karl-ac-preview-screen-K1` and `karl-ac-approval-binding-K2` are
        SATISFIED — AC-CARGO-018.6 through .9 and .10 through .15.
    R11 WO-CARGO-023's #QbBillAdopter bootstrap declaration is retired — AC-CARGO-018.16 through
        .24 authorize the attempt log and the adoption path. Its execution-budget work is now
        required by AC-CARGO-018.25 through .30.
    R12 Eighteen new ACs need claiming: AC-KIT-008.43, .44 · AC-KIT-009.30, .31, .32, .33 ·
        AC-KIT-010.20 · AC-KIT-011.28, .29, .30, .31, .32, .33, .34 ·
        AC-KIT-012.29, .30, .31, .32 · plus AC-CARGO-018.6 through .30 in the Cargo FRD. Likely
        owners: WO-KIT-001 (008.43/.44, 009.32/.33, 010.20, 012.29/.30/.31/.32), WO-KIT-002
        (009.30/.31), WO-CARGO-020 (011.30, 011.32), WO-CARGO-022 (018.6-.15), WO-CARGO-023
        (011.28/.29, 018.16-.30) and WO-026 (011.31, 011.33/.34) — but allocation is Foreman's,
        not Karl's. Total AC count in this FRD moves 145 → 163 (eighteen added).

ROUTED OUT OF THIS DOCUMENT (Revision 3). These are not Requirements defects; they are places where
  a Blueprint or a Work Order now disagrees with this file and must be revised by its owner.

  To Boris (Architect):
    B1  @blueprint:paver-qb-guarded-quickbooks-client is a full revision behind. Its
        #CustodyConformanceSuite block (:127) still specifies "failing a driver unless exactly one
        refresh exchange occurred (AC-KIT-009.6)" — the criterion Boris's own ADR-006 argued against
        and Revision 2 re-cut. Its :129 still cites AC-KIT-009.14/.15 for tenant scoping; that moved
        to AC-KIT-009.20. Its Requirement-Defect table still lists roughly twelve of seventeen
        defects as open which Revision 2 closed. A builder reading the component block builds the
        suite its own ADR rejects.
    B2  Same file, Key Contracts: "The package exports no raw contract surface through which a
        consumer could dispatch a create directly" must be re-cut. The package now exports the
        guarded contract for non-create writes. The correct line is AC-KIT-008.39 — no path that
        dispatches a write WITHOUT a capability token.
    B3  Same file, ADR-003: "Ledger's other eleven workflow names stay in Ledger's own
        creation-policy" cannot survive AC-KIT-011.2 deleting that file. They become consumer
        workflow identities in the package's table with empty create-grant sets. ADR-003 also needs
        the grant-kind distinction from D1.
    B4  @blueprint:cargo-container-blueprint ADR-018: "Ledger does not keep a createBill grant. The
        grant moves; it is never held by both" is now false by operator decision D1, as is its
        cutover mechanism (one release moving the grant, both consumers never holding it at once) —
        no Work Order builds two grant tables, and D1 removes the reason to. Its provenance
        paragraph is closer to right than anything else in the chain and should be lifted into the
        ADR body rather than left as an aside; AC-KIT-012.23 through .26 are its Requirement form.
    B5  ADR-002's "no third database" and pooler-availability discussion should be re-read against
        the D3 measurement recorded in Closed Question 2. Any text treating the pooler as unverified
        or naming a third database as a fallback is stale.

  To Foreman (Andrew Taylor):
    F1  WO-KIT-001's added-AC 2 must be WITHDRAWN. It implements AC-KIT-012.3 as "exactly one" on
        the premise that createJournalEntry is not on the package's exposed create set. The same
        WO's In Scope table moves contract.ts whole, which puts it there. See the contract.ts ruling
        above; the AC is now "no more than one" and the added AC has no subject.
    F2  Ordering. D1 removes the window finding 3 named, but the ordering must be written into
        blocked-by rather than into prose. Cargo must be able to post before Ledger's grant kind
        changes: WO-CARGO-023 should not be blocked by WO-026, and WO-026 should be blocked by
        WO-CARGO-023. Today it is the reverse, on a premise (an atomic grant move) that D1 retires.
    F3  WO-026 depends on locking the shared qb_token row through a driver built in WO-CARGO-020,
        inside Cargo's repo, which Ledger cannot import — separate repos, and AC-KIT-011.4 forbids
        reading outside the repo. WO-026's blocked-by lists WO-KIT-001 only. Where that driver
        lives is a Blueprint question (B5) and its ordering is a Foreman question; neither is
        answered today. Note that Closed Question 2 settles that Ledger DOES share the store, so
        the driver must be reachable from both — a kit package or a duplicated driver, and a
        duplicated driver is the drift this FRD exists to end.
    F4  WO-CARGO-019 (shipped, commit 1a65cb2) is load-bearing for WO-CARGO-022's decideTransition
        and role gate, for WO-CARGO-023's terminal-status rule, and for the staged OGK invoice that
        is the object of the first production write. It appears in no blocked-by and its blocks
        list is empty.
    F5  WO-CARGO-023's #QbBillAdopter — the admin adoption screen, the attempt table, the
        uniqueness claim, the write of qb_bill_id and the flip to 'posted' — is unrequired
        capability with no bootstrap declaration, while WO-CARGO-021 and -022 declared bootstrap
        for smaller gaps. Either declare it or write the AC in @REQ-CARGO-018. It is not a
        @REQ-KIT-008 gap: the package's half is AC-KIT-008.33 and AC-KIT-008.34, which exist.
    F6  Migration numbering. Cargo's tree ends at 0025_invoice_storage.sql (0024 and 0025 applied to
        production). The Work Orders allocate 0027/0028/0029/0030/0031 and nothing owns 0026, while
        @blueprint:cargo-container-blueprint ADR-021 — cited by WO-CARGO-022 as its authority —
        names migration 0026 for the same approved_plan_hash column WO-CARGO-022 puts in 0030.

  To Karl, in a separate authoring unit (@REQ-CARGO-018, not this file) — ALL FOUR DONE in
  Revision 4, written into brands/madson-co/.paver/requirements/cargo-frd.md:
    K1  The preview screen → AC-CARGO-018.6, .7, .8, .9.
    K2  The approval as a separate human act bound to a plan hash → AC-CARGO-018.10 through .15.
    K3  The lost-response adoption path → AC-CARGO-018.16 through .24.
    K4  The posting route's execution limit → AC-CARGO-018.25 through .30.

SOURCING — every behavioural claim in the Overview and Terminology is read from these files:
  ledger/src/qb/creation-policy.ts:16-31,41-54  ·  ledger/src/qb/approval-gate.ts:65,98
  ledger/src/qb/token-store.ts:5-18,32-41,64-71,73,86,111-146
  ledger/src/qb/oauth.ts:199-202,218-221
  ledger/src/workflows/vendor-bill.ts:1030-1070,1080-1133,1011,630-658,681-694,1005
  ledger/src/plan/change-plan.ts:1-2 (the module-level node:fs import AC-KIT-010.5 splits)
  kit/README.md:24 (@paver/qb deferred line)  ·  kit REQ-KIT-001 FRD:101-108
  cargo-frd.md:279-289 (AC-CARGO-018.1 through .018.5)  ·  madson-hq-frd.md:84-94 (REQ-MADSON-006,
  AC-MADSON-006.4 "shall not execute any financial write ... until a human has approved it")
  The 0.005 tolerance in AC-KIT-008.13 is Ledger's, at vendor-bill.ts:1112. The 32-character
  minimum in AC-KIT-009.12 is Ledger's, at token-store.ts:65-69.
  Added in Revision 3:
  ledger/src/qb/guarded.ts:4-6,30-40,52-58,66-96 (GuardedContract composes creation-policy,
    approval-gate and write-verifier — the reason AC-KIT-011.2 could not stand as written)
  ledger/src/workflows/reconcile.ts:7-8,972  ·  ledger/src/workflows/apply-review.ts:4,6,56
    (the two non-create callers of GuardedContract)
  ledger/src/qb/contract.ts:312,326-336 (createJournalEntry is declared on the contract and listed
    in CONTRACT_METHODS — the fact that decides AC-KIT-012.3)
  ledger/src/cli.ts:8 and ledger/src/workflows/expense-review.ts:6 (presentPlan is imported outside
    the create path — the reason AC-KIT-008.41 exists)
  Operator decisions D1, D2 and D3, taken 2026-08-14 after Revision 2 shipped. D3's pooler figures
  are a direct measurement of Supabase project ezzfbtqcdyxxilpumzkw on 2026-08-14, not a document.

  Added in Revision 4:
  ledger/src/qb/creation-policy.ts:80-85 (`assertMayCreate` returns early for every non-creation
    method — the root cause of the authorization hole, in four lines)
  ledger/src/qb/method-groups.ts:56-70 (WRITE_METHODS is six methods; CREATION_METHODS is two, so
    four write methods were unauthorized by construction)
  ledger/src/qb/guarded.ts:53-56,72-78 (both authorization call sites are `assertMayCreate`)
  ledger/config/tenants/madson/tenant.json:14 (every method group routes at the self-hosted REST
    adapter, and the file records the WO-006 capability-diff reason: the hosted adapter cannot
    carry a per-line ClassRef on an item-based line)
  Operator decision D4, taken 2026-08-14: advisory provenance, one Intuit application,
    two-application attribution rejected.
  Measured 2026-08-14: unicorn-ceo/.mcp.json and Ledger use DIFFERENT Intuit OAuth applications
    against the SAME production realm. Key names only; no value read or reproduced.

  Added in Revision 5 (all read 2026-08-14, none inferred):
  ledger/src/qb/adapters/rest-client.ts:59,67 (the request is built as `/v3/company/{realmId}` with
    a `minorversion` query parameter — the shape AC-KIT-011.39 and AC-KIT-011.42 name, and the
    reason they name an interface rather than a hostname)
  ledger/src/qb/adapters/hosted.ts:1,191 (imports `node:fs` and addresses
    `https://ai-inc.quickbooks.intuit.com/v1/mcp` — a QuickBooks host that is not the Accounting
    API, which is why an HTTP-shaped criterion would have been false here)
  ledger/src/qb/adapters/self-hosted.ts:22-24,297 (imports `declareCapabilities` and
    `AdapterCapabilities` from `../capabilities.js` and `Adapter` from `../router.js` — the fact
    behind R13; the class itself is exported at :297)
  ledger/src/qb/adapters/ (the directory holds capability-differ.ts, hosted.ts, mcp-stdio-client.ts,
    rest-client.ts, self-hosted.ts, stub.ts — six files, two of which cross)
  @blueprint:paver-qb-guarded-quickbooks-client ADR-014 and @blueprint:quickbooks-connector ADR-008
    (the crossing decision this revision gives a Requirement to)
  @blueprint:cargo-container-blueprint ADR-019 (the mapping decision AC-CARGO-018.31 through .54
    give a Requirement to, including its four qualifications and its `service_role` grant note)
  cargo/supabase/migrations/ ends at 0025_invoice_storage.sql — measured, so no mapping table exists
    today and the mapping ACs are written as Requirements on Cargo's store rather than as citations
    of a shipped table.

  UNSOURCED, and marked as such: whether the QuickBooks field carrying the idempotency marker and
  the provenance stamp is filterable (Open Question 1), and whether Intuit honours a grace window
  for a prior refresh token (Open Question 2). Revision 3's unsourced item — whether the Intuit
  application inline in unicorn-ceo/.mcp.json is this lineage's — is now measured and answered: it
  is a different application against the same realm.
-->
