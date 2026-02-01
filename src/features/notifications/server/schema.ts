import { pgTable, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "@/features/auth/server/schema";
import { type InferSelectModel } from "drizzle-orm";

// Push Subscriptions - 存储用户的 Web Push 订阅信息
export const pushSubscriptions = pgTable("push_subscriptions", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),

    // 标准 Web Push 订阅字段
    endpoint: text("endpoint").notNull(), // 浏览器推送服务的唯一URL
    p256dh: text("p256dh").notNull(),     // 用户公钥 (Key for encryption)
    auth: text("auth").notNull(),         // 用户私钥 (Auth secret)

    // 辅助字段
    userAgent: text("user_agent"),        // 记录设备信息，方便用户管理（如 "Chrome on Android"）

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    // 确保同一个用户在同一个设备（endpoint相同）只有一个记录
    unique("uniq_user_endpoint").on(table.userId, table.endpoint),
    index("idx_push_subs_user").on(table.userId),
]);

export type PushSubscription = InferSelectModel<typeof pushSubscriptions>;
