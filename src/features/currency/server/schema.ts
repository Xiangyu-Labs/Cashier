import {
    sqliteTable,
    text,
    integer,
} from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

// CurrencyRates (汇率缓存 - Daily Snapshot)
export const currencyRates = sqliteTable("currency_rates", {
    date: text("date").primaryKey(), // YYYY-MM-DD
    base: text("base").notNull().default("EUR"), // Always EUR from Frankfurter
    rates: text("rates", { mode: "json" }).$type<Record<string, number>>().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export type CurrencyRate = InferSelectModel<typeof currencyRates>;
