/**
 * @paver/contracts — shared cross-product data shapes for the Paver fleet.
 *
 * The vocabulary that lets products connect through typed imports instead of
 * re-modeled couplings: an Order in Closer IS an Order in Cargo. A dependency-
 * free leaf (no other @paver/* package) so any consumer can adopt it in
 * isolation. Traces to @REQ-KIT-005.
 */
export {
  BrandCodeSchema,
  MoneySchema,
  IdSchema,
  EmailSchema,
  IsoDateSchema,
  type BrandCode,
  type Money,
} from "./primitives.ts";
export { BrandSchema, type Brand } from "./brand.ts";
export { SkuSchema, SkuStatusSchema, type Sku, type SkuStatus } from "./sku.ts";
export {
  OrderSchema,
  OrderLineSchema,
  OrderSourceSchema,
  OrderStatusSchema,
  type Order,
  type OrderLine,
  type OrderSource,
  type OrderStatus,
} from "./order.ts";
export { LeadSchema, LeadStageSchema, type Lead, type LeadStage } from "./lead.ts";
export {
  PoSchema,
  PoLineSchema,
  PoStatusSchema,
  type Po,
  type PoLine,
  type PoStatus,
} from "./po.ts";
