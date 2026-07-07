import { z } from "zod";
import { BrandCodeSchema, EmailSchema } from "./primitives.ts";

/** CRM pipeline stage. "Blocked" is deliberately absent (Karri's rule). */
export const LeadStageSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

/**
 * Lead — a sales-pipeline record owned by Closer's CRM. One accountable owner.
 * Traces to AC-KIT-005.1.
 */
export const LeadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: EmailSchema.optional(),
  phone: z.string().optional(),
  stage: LeadStageSchema,
  ownerEmail: EmailSchema.optional(),
  brand: BrandCodeSchema.optional(),
  source: z.string().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;
