import { z } from "zod";
import { BrandCodeSchema } from "./primitives.ts";

/**
 * Brand — one of the six portfolio brands. Brand is a tag/dimension across the
 * fleet (RACK ADR-001), never a silo. Traces to AC-KIT-005.1.
 */
export const BrandSchema = z.object({
  code: BrandCodeSchema,
  name: z.string().min(1),
});
export type Brand = z.infer<typeof BrandSchema>;
