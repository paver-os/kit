import { z } from 'zod';

/**
 * Shared primitives used across the fleet contracts. Kept version-stable — only
 * Zod APIs available across v3.23+ and v4 are used (no `.email()`/`.datetime()`
 * method forms, which moved to top-level in v4; regex instead).
 */
/** The six Madson & Co. brand codes (RACK ADR-001: brand is a tag, never a silo). */
declare const BrandCodeSchema: z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>;
type BrandCode = z.infer<typeof BrandCodeSchema>;
/** Money as integer minor units + ISO-4217 currency — never a float. */
declare const MoneySchema: z.ZodObject<{
    amountCents: z.ZodNumber;
    currency: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amountCents: number;
    currency: string;
}, {
    amountCents: number;
    currency: string;
}>;
type Money = z.infer<typeof MoneySchema>;
/** A non-empty identifier string. */
declare const IdSchema: z.ZodString;
/** Email, validated with a version-stable regex (not `.email()`). */
declare const EmailSchema: z.ZodString;
/** ISO-8601 date or datetime string (version-stable regex, not `.datetime()`). */
declare const IsoDateSchema: z.ZodString;

/**
 * Brand — one of the six portfolio brands. Brand is a tag/dimension across the
 * fleet (RACK ADR-001), never a silo. Traces to AC-KIT-005.1.
 */
declare const BrandSchema: z.ZodObject<{
    code: z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: "M" | "VZ" | "DD" | "JF" | "MT" | "R";
    name: string;
}, {
    code: "M" | "VZ" | "DD" | "JF" | "MT" | "R";
    name: string;
}>;
type Brand = z.infer<typeof BrandSchema>;

/** SKU lifecycle status. */
declare const SkuStatusSchema: z.ZodEnum<["draft", "active", "discontinued"]>;
type SkuStatus = z.infer<typeof SkuStatusSchema>;
/**
 * SKU — a sellable product identifier, owned canonically by Cargo but referenced
 * by Closer (orders) and RACK (work). Traces to AC-KIT-005.1.
 */
declare const SkuSchema: z.ZodObject<{
    sku: z.ZodString;
    brand: z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>;
    title: z.ZodString;
    upc: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["draft", "active", "discontinued"]>;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "active" | "discontinued";
    sku: string;
    brand: "M" | "VZ" | "DD" | "JF" | "MT" | "R";
    title: string;
    upc?: string | undefined;
}, {
    status: "draft" | "active" | "discontinued";
    sku: string;
    brand: "M" | "VZ" | "DD" | "JF" | "MT" | "R";
    title: string;
    upc?: string | undefined;
}>;
type Sku = z.infer<typeof SkuSchema>;

declare const OrderSourceSchema: z.ZodEnum<["shopify", "wholesale", "manual"]>;
type OrderSource = z.infer<typeof OrderSourceSchema>;
declare const OrderStatusSchema: z.ZodEnum<["draft", "open", "fulfilled", "cancelled"]>;
type OrderStatus = z.infer<typeof OrderStatusSchema>;
declare const OrderLineSchema: z.ZodObject<{
    sku: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodObject<{
        amountCents: z.ZodNumber;
        currency: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amountCents: number;
        currency: string;
    }, {
        amountCents: number;
        currency: string;
    }>;
}, "strip", z.ZodTypeAny, {
    sku: string;
    quantity: number;
    unitPrice: {
        amountCents: number;
        currency: string;
    };
}, {
    sku: string;
    quantity: number;
    unitPrice: {
        amountCents: number;
        currency: string;
    };
}>;
type OrderLine = z.infer<typeof OrderLineSchema>;
/**
 * Order — a sales order. Shopify is the source of truth for DTC/wholesale;
 * Closer creates draft orders. Referenced by profit/margin analytics. Traces to
 * AC-KIT-005.1.
 */
declare const OrderSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodEnum<["shopify", "wholesale", "manual"]>;
    brand: z.ZodOptional<z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>>;
    customerName: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["draft", "open", "fulfilled", "cancelled"]>;
    lines: z.ZodArray<z.ZodObject<{
        sku: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodObject<{
            amountCents: z.ZodNumber;
            currency: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            amountCents: number;
            currency: string;
        }, {
            amountCents: number;
            currency: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        sku: string;
        quantity: number;
        unitPrice: {
            amountCents: number;
            currency: string;
        };
    }, {
        sku: string;
        quantity: number;
        unitPrice: {
            amountCents: number;
            currency: string;
        };
    }>, "many">;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "open" | "fulfilled" | "cancelled";
    id: string;
    source: "shopify" | "wholesale" | "manual";
    lines: {
        sku: string;
        quantity: number;
        unitPrice: {
            amountCents: number;
            currency: string;
        };
    }[];
    createdAt: string;
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
    customerName?: string | undefined;
}, {
    status: "draft" | "open" | "fulfilled" | "cancelled";
    id: string;
    source: "shopify" | "wholesale" | "manual";
    lines: {
        sku: string;
        quantity: number;
        unitPrice: {
            amountCents: number;
            currency: string;
        };
    }[];
    createdAt: string;
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
    customerName?: string | undefined;
}>;
type Order = z.infer<typeof OrderSchema>;

/** CRM pipeline stage. "Blocked" is deliberately absent (Karri's rule). */
declare const LeadStageSchema: z.ZodEnum<["new", "contacted", "qualified", "won", "lost"]>;
type LeadStage = z.infer<typeof LeadStageSchema>;
/**
 * Lead — a sales-pipeline record owned by Closer's CRM. One accountable owner.
 * Traces to AC-KIT-005.1.
 */
declare const LeadSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    stage: z.ZodEnum<["new", "contacted", "qualified", "won", "lost"]>;
    ownerEmail: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>>;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    stage: "new" | "contacted" | "qualified" | "won" | "lost";
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
    source?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    ownerEmail?: string | undefined;
}, {
    name: string;
    id: string;
    stage: "new" | "contacted" | "qualified" | "won" | "lost";
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
    source?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    ownerEmail?: string | undefined;
}>;
type Lead = z.infer<typeof LeadSchema>;

/** Purchase-order lifecycle, owned canonically by Cargo. */
declare const PoStatusSchema: z.ZodEnum<["draft", "issued", "confirmed", "in_production", "shipped", "received", "closed", "cancelled"]>;
type PoStatus = z.infer<typeof PoStatusSchema>;
declare const PoLineSchema: z.ZodObject<{
    sku: z.ZodString;
    quantity: z.ZodNumber;
    unitCost: z.ZodObject<{
        amountCents: z.ZodNumber;
        currency: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amountCents: number;
        currency: string;
    }, {
        amountCents: number;
        currency: string;
    }>;
}, "strip", z.ZodTypeAny, {
    sku: string;
    quantity: number;
    unitCost: {
        amountCents: number;
        currency: string;
    };
}, {
    sku: string;
    quantity: number;
    unitCost: {
        amountCents: number;
        currency: string;
    };
}>;
type PoLine = z.infer<typeof PoLineSchema>;
/**
 * PO — a factory purchase order, owned canonically by Cargo (the Product Supply
 * & Reorder Loop). RACK shell-links to it, never re-models it. Traces to
 * AC-KIT-005.1.
 */
declare const PoSchema: z.ZodObject<{
    id: z.ZodString;
    poNumber: z.ZodString;
    vendor: z.ZodString;
    brand: z.ZodOptional<z.ZodEnum<["M", "VZ", "DD", "JF", "MT", "R"]>>;
    status: z.ZodEnum<["draft", "issued", "confirmed", "in_production", "shipped", "received", "closed", "cancelled"]>;
    lines: z.ZodArray<z.ZodObject<{
        sku: z.ZodString;
        quantity: z.ZodNumber;
        unitCost: z.ZodObject<{
            amountCents: z.ZodNumber;
            currency: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            amountCents: number;
            currency: string;
        }, {
            amountCents: number;
            currency: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        sku: string;
        quantity: number;
        unitCost: {
            amountCents: number;
            currency: string;
        };
    }, {
        sku: string;
        quantity: number;
        unitCost: {
            amountCents: number;
            currency: string;
        };
    }>, "many">;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "received" | "draft" | "cancelled" | "issued" | "confirmed" | "in_production" | "shipped" | "closed";
    id: string;
    lines: {
        sku: string;
        quantity: number;
        unitCost: {
            amountCents: number;
            currency: string;
        };
    }[];
    createdAt: string;
    poNumber: string;
    vendor: string;
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
}, {
    status: "received" | "draft" | "cancelled" | "issued" | "confirmed" | "in_production" | "shipped" | "closed";
    id: string;
    lines: {
        sku: string;
        quantity: number;
        unitCost: {
            amountCents: number;
            currency: string;
        };
    }[];
    createdAt: string;
    poNumber: string;
    vendor: string;
    brand?: "M" | "VZ" | "DD" | "JF" | "MT" | "R" | undefined;
}>;
type Po = z.infer<typeof PoSchema>;

export { type Brand, type BrandCode, BrandCodeSchema, BrandSchema, EmailSchema, IdSchema, IsoDateSchema, type Lead, LeadSchema, type LeadStage, LeadStageSchema, type Money, MoneySchema, type Order, type OrderLine, OrderLineSchema, OrderSchema, type OrderSource, OrderSourceSchema, type OrderStatus, OrderStatusSchema, type Po, type PoLine, PoLineSchema, PoSchema, type PoStatus, PoStatusSchema, type Sku, SkuSchema, type SkuStatus, SkuStatusSchema };
