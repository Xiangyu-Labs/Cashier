import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

export const currencyRates = sqliteTable("currency_rates", {
  date: text("date").primaryKey(),
  base: text("base").notNull().default("EUR"),
  rates: text("rates", { mode: "json" }).$type<Record<string, number>>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CurrencyRate = InferSelectModel<typeof currencyRates>;
