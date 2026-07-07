import { z } from "zod";
import { BrandCodeSchema, MoneySchema, IsoDateSchema } from "./primitives.ts";

/** Purchase-order lifecycle, owned canonically by Cargo. */
export const PoStatusSchema = z.enum([
  "draft",
  "issued",
  "confirmed",
  "in_production",
  "shipped",
  "received",
  "closed",
  "cancelled",
]);
export type PoStatus = z.infer<typeof PoStatusSchema>;

export const PoLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitCost: MoneySchema,
});
export type PoLine = z.infer<typeof PoLineSchema>;

/**
 * PO — a factory purchase order, owned canonically by Cargo (the Product Supply
 * & Reorder Loop). RACK shell-links to it, never re-models it. Traces to
 * AC-KIT-005.1.
 */
export const PoSchema = z.object({
  id: z.string().min(1),
  poNumber: z.string().min(1),
  vendor: z.string().min(1),
  brand: BrandCodeSchema.optional(),
  status: PoStatusSchema,
  lines: z.array(PoLineSchema),
  createdAt: IsoDateSchema,
});
export type Po = z.infer<typeof PoSchema>;
