import { pgTable, varchar, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";

export const currencyRates = pgTable("currency_rates", {
  date: date("date", { mode: "string" }).primaryKey(),
  base: varchar("base", { length: 3 }).notNull().default("EUR"),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CurrencyRate = InferSelectModel<typeof currencyRates>;
