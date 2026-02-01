import {
    pgTable,
    text,
    timestamp,
    jsonb,
    date,
} from "drizzle-orm/pg-core";

// CurrencyRates (汇率缓存 - Daily Snapshot)
export const currencyRates = pgTable("currency_rates", {
    date: date("date", { mode: "string" }).primaryKey(), // YYYY-MM-DD
    base: text("base").notNull().default("EUR"), // Always EUR from Frankfurter
    rates: jsonb("rates").$type<Record<string, number>>().notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
