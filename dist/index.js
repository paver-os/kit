// src/primitives.ts
import { z } from "zod";
var BrandCodeSchema = z.enum(["M", "VZ", "DD", "JF", "MT", "R"]);
var MoneySchema = z.object({
  amountCents: z.number().int(),
  currency: z.string().length(3)
});
var IdSchema = z.string().min(1);
var EmailSchema = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email address");
var IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/, "must be an ISO-8601 date/datetime");

// src/brand.ts
import { z as z2 } from "zod";
var BrandSchema = z2.object({
  code: BrandCodeSchema,
  name: z2.string().min(1)
});

// src/sku.ts
import { z as z3 } from "zod";
var SkuStatusSchema = z3.enum(["draft", "active", "discontinued"]);
var SkuSchema = z3.object({
  sku: z3.string().min(1),
  brand: BrandCodeSchema,
  title: z3.string().min(1),
  upc: z3.string().optional(),
  status: SkuStatusSchema
});

// src/asset.ts
import { z as z4 } from "zod";
var AssetStatusSchema = z4.enum(["Raw", "Select", "Approved", "Final", "Archived"]);
var AssetSchema = z4.object({
  id: z4.string().min(1),
  // Drive file ID — stable across renames/moves
  brand: BrandCodeSchema,
  status: AssetStatusSchema,
  thumbnailUrl: z4.string().min(1),
  originalUrl: z4.string().min(1)
});

// src/order.ts
import { z as z5 } from "zod";
var OrderSourceSchema = z5.enum(["shopify", "wholesale", "manual"]);
var OrderStatusSchema = z5.enum(["draft", "open", "fulfilled", "cancelled"]);
var OrderLineSchema = z5.object({
  sku: z5.string().min(1),
  quantity: z5.number().int().positive(),
  unitPrice: MoneySchema
});
var OrderSchema = z5.object({
  id: z5.string().min(1),
  source: OrderSourceSchema,
  brand: BrandCodeSchema.optional(),
  customerName: z5.string().optional(),
  status: OrderStatusSchema,
  lines: z5.array(OrderLineSchema),
  createdAt: IsoDateSchema
});

// src/lead.ts
import { z as z6 } from "zod";
var LeadStageSchema = z6.enum([
  "new",
  "contacted",
  "qualified",
  "won",
  "lost"
]);
var LeadSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  email: EmailSchema.optional(),
  phone: z6.string().optional(),
  stage: LeadStageSchema,
  ownerEmail: EmailSchema.optional(),
  brand: BrandCodeSchema.optional(),
  source: z6.string().optional()
});

// src/po.ts
import { z as z7 } from "zod";
var PoStatusSchema = z7.enum([
  "draft",
  "issued",
  "confirmed",
  "in_production",
  "shipped",
  "received",
  "closed",
  "cancelled"
]);
var PoLineSchema = z7.object({
  sku: z7.string().min(1),
  quantity: z7.number().int().positive(),
  unitCost: MoneySchema
});
var PoSchema = z7.object({
  id: z7.string().min(1),
  poNumber: z7.string().min(1),
  vendor: z7.string().min(1),
  brand: BrandCodeSchema.optional(),
  status: PoStatusSchema,
  lines: z7.array(PoLineSchema),
  createdAt: IsoDateSchema
});
export {
  AssetSchema,
  AssetStatusSchema,
  BrandCodeSchema,
  BrandSchema,
  EmailSchema,
  IdSchema,
  IsoDateSchema,
  LeadSchema,
  LeadStageSchema,
  MoneySchema,
  OrderLineSchema,
  OrderSchema,
  OrderSourceSchema,
  OrderStatusSchema,
  PoLineSchema,
  PoSchema,
  PoStatusSchema,
  SkuSchema,
  SkuStatusSchema
};
