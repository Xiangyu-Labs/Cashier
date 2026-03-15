#!/usr/bin/env tsx
// scripts/cleanup-multi-ledgers.ts
// 清理多账本用户，只保留主账本（或最早的账本）

import { db } from "@/lib/db";
import { ledgers, users } from "@/lib/db/schema";
import { eq, isNull, asc } from "drizzle-orm";

async function cleanupMultiLedgers() {
    console.log("Starting multi-ledger cleanup...\n");

    // 获取所有用户及其账本
    const allUsers = await db.query.users.findMany({
        with: {
            ledgers: {
                where: isNull(ledgers.deletedAt),
                orderBy: [asc(ledgers.createdAt)],
            },
        },
    });

    let processedUsers = 0;
    let deletedCount = 0;

    for (const user of allUsers) {
        const userLedgers = user.ledgers || [];

        if (userLedgers.length <= 1) {
            continue; // 用户只有一个或零个账本，无需处理
        }

        processedUsers++;
        console.log(`User ${user.id} (${user.email || "no email"}) has ${userLedgers.length} ledgers:`);

        // 确定保留哪个账本：优先保留 defaultLedgerId 对应的账本，否则保留最早的
        const defaultLedgerId = user.defaultLedgerId;
        let primaryLedger = userLedgers.find(l => l.id === defaultLedgerId);

        if (!primaryLedger) {
            primaryLedger = userLedgers[0]; // 保留最早的
        }

        const ledgersToDelete = userLedgers.filter(l => l.id !== primaryLedger.id);

        console.log(`  Keeping: ${primaryLedger.id} (${primaryLedger.name})`);
        console.log(`  Deleting: ${ledgersToDelete.map(l => `${l.id} (${l.name})`).join(", ")}`);

        // 软删除其他账本
        for (const ledger of ledgersToDelete) {
            await db
                .update(ledgers)
                .set({ deletedAt: new Date() })
                .where(eq(ledgers.id, ledger.id));
            deletedCount++;
        }

        console.log("");
    }

    console.log("=".repeat(50));
    console.log(`Cleanup complete.`);
    console.log(`  Users processed: ${processedUsers}`);
    console.log(`  Ledgers deleted: ${deletedCount}`);
    console.log("=".repeat(50));
}

cleanupMultiLedgers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Cleanup failed:", error);
        process.exit(1);
    });
