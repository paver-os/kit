import { z } from "zod";

/**
 * Shared primitives used across the fleet contracts. Kept version-stable — only
 * Zod APIs available across v3.23+ and v4 are used (no `.email()`/`.datetime()`
 * method forms, which moved to top-level in v4; regex instead).
 */

/** The six Madson & Co. brand codes (RACK ADR-001: brand is a tag, never a silo). */
export const BrandCodeSchema = z.enum(["M", "VZ", "DD", "JF", "MT", "R"]);
export type BrandCode = z.infer<typeof BrandCodeSchema>;

/** Money as integer minor units + ISO-4217 currency — never a float. */
export const MoneySchema = z.object({
  amountCents: z.number().int(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof MoneySchema>;

/** A non-empty identifier string. */
export const IdSchema = z.string().min(1);

/** Email, validated with a version-stable regex (not `.email()`). */
export const EmailSchema = z
  .string()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email address");

/** ISO-8601 date or datetime string (version-stable regex, not `.datetime()`). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/, "must be an ISO-8601 date/datetime");
