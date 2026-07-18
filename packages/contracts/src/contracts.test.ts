import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BrandSchema,
  SkuSchema,
  AssetSchema,
  OrderSchema,
  LeadSchema,
  PoSchema,
} from "./index.ts";

// AC-KIT-005.2 — each contract parses a valid example and rejects an invalid one.

test("Brand: valid parses, bad code rejects", () => {
  assert.doesNotThrow(() => BrandSchema.parse({ code: "VZ", name: "VonZipper" }));
  assert.equal(BrandSchema.safeParse({ code: "XX", name: "Nope" }).success, false);
});

test("SKU: valid parses, missing brand rejects", () => {
  assert.doesNotThrow(() =>
    SkuSchema.parse({ sku: "VZ-ELMORE-BLK", brand: "VZ", title: "Elmore Black", status: "active" }),
  );
  assert.equal(
    SkuSchema.safeParse({ sku: "X", title: "no brand", status: "active" }).success,
    false,
  );
});

test("Order: valid parses, non-integer quantity rejects", () => {
  const valid = {
    id: "ord_1",
    source: "shopify",
    status: "open",
    lines: [{ sku: "VZ-ELMORE-BLK", quantity: 2, unitPrice: { amountCents: 8500, currency: "USD" } }],
    createdAt: "2026-07-06T12:00:00Z",
  };
  assert.doesNotThrow(() => OrderSchema.parse(valid));
  assert.equal(
    OrderSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], quantity: 1.5 }] }).success,
    false,
  );
});

test("Lead: valid parses, bad email rejects", () => {
  assert.doesNotThrow(() =>
    LeadSchema.parse({ id: "lead_1", name: "Optics Co", stage: "qualified", email: "buyer@optics.co" }),
  );
  assert.equal(
    LeadSchema.safeParse({ id: "lead_1", name: "Optics Co", stage: "qualified", email: "not-an-email" }).success,
    false,
  );
});

test("PO: valid parses, bad status rejects", () => {
  const valid = {
    id: "po_1",
    poNumber: "PO-2026-014",
    vendor: "Shenzhen Optical",
    status: "issued",
    lines: [{ sku: "VZ-ELMORE-BLK", quantity: 500, unitCost: { amountCents: 1200, currency: "USD" } }],
    createdAt: "2026-07-06",
  };
  assert.doesNotThrow(() => PoSchema.parse(valid));
  assert.equal(PoSchema.safeParse({ ...valid, status: "paid" }).success, false);
});

test("Asset: valid parses, bad brand and bad status reject", () => {
  const valid = {
    id: "1a2b3c_drive_file",
    brand: "M",
    status: "Approved",
    thumbnailUrl: "https://drive.example/thumb/1a2b3c",
    originalUrl: "https://drive.example/file/1a2b3c",
  };
  assert.doesNotThrow(() => AssetSchema.parse(valid));
  assert.equal(AssetSchema.safeParse({ ...valid, brand: "XX" }).success, false);
  assert.equal(AssetSchema.safeParse({ ...valid, status: "Published" }).success, false);
});
