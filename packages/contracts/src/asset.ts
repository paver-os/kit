import { z } from "zod";
import { BrandCodeSchema } from "./primitives.ts";

/** Asset lifecycle status — mirrors Surf's `asset.status` (SURF migration 0001). */
export const AssetStatusSchema = z.enum(["Raw", "Select", "Approved", "Final", "Archived"]);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

/**
 * Asset — a single visual asset owned canonically by Surf (the fleet's shared
 * asset hub) and referenced by any product that needs imagery: Closer product
 * pages, RACK work, Nighthawk campaigns. The cross-product seam is deliberately
 * narrow — only the five fields a consumer needs to render and link an asset.
 * Rights, hotspot, and embedding stay Surf-internal until a consumer needs them
 * (additive evolution per ADR-006). Traces to AC-SURF-010.1/.2.
 *
 * `id` is the Drive file ID (opaque, stable, ADR-010). Evolve additively only:
 * new optional fields are safe; a required field or a removed field is a new
 * major tag.
 */
export const AssetSchema = z.object({
  id: z.string().min(1), // Drive file ID — stable across renames/moves
  brand: BrandCodeSchema,
  status: AssetStatusSchema,
  thumbnailUrl: z.string().min(1),
  originalUrl: z.string().min(1),
});
export type Asset = z.infer<typeof AssetSchema>;
