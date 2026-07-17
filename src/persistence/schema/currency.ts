import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";

export const currencyRates = pgTable("currency_rates", {
  date: text("date").primaryKey(),
  base: text("base").notNull().default("EUR"),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CurrencyRate = InferSelectModel<typeof currencyRates>;
