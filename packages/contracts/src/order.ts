import { z } from "zod";
import { BrandCodeSchema, MoneySchema, IsoDateSchema } from "./primitives.ts";

export const OrderSourceSchema = z.enum(["shopify", "wholesale", "manual"]);
export type OrderSource = z.infer<typeof OrderSourceSchema>;

export const OrderStatusSchema = z.enum(["draft", "open", "fulfilled", "cancelled"]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: MoneySchema,
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

/**
 * Order — a sales order. Shopify is the source of truth for DTC/wholesale;
 * Closer creates draft orders. Referenced by profit/margin analytics. Traces to
 * AC-KIT-005.1.
 */
export const OrderSchema = z.object({
  id: z.string().min(1),
  source: OrderSourceSchema,
  brand: BrandCodeSchema.optional(),
  customerName: z.string().optional(),
  status: OrderStatusSchema,
  lines: z.array(OrderLineSchema),
  createdAt: IsoDateSchema,
});
export type Order = z.infer<typeof OrderSchema>;
