import { z } from "zod";
import { BrandCodeSchema } from "./primitives.ts";

/** SKU lifecycle status. */
export const SkuStatusSchema = z.enum(["draft", "active", "discontinued"]);
export type SkuStatus = z.infer<typeof SkuStatusSchema>;

/**
 * SKU — a sellable product identifier, owned canonically by Cargo but referenced
 * by Closer (orders) and RACK (work). Traces to AC-KIT-005.1.
 */
export const SkuSchema = z.object({
  sku: z.string().min(1),
  brand: BrandCodeSchema,
  title: z.string().min(1),
  upc: z.string().optional(),
  status: SkuStatusSchema,
});
export type Sku = z.infer<typeof SkuSchema>;
