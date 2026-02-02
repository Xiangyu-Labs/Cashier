import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function checkCategory() {
    const ledgerId = "9b14f3c5-141c-43ab-8ad5-6bf6b873c15b";
    const categoryName = "避孕套";

    // 查询所有记录（包括软删除）
    const allRecords = await db.select().from(entryCategories).where(
        and(
            eq(entryCategories.ledgerId, ledgerId),
            eq(entryCategories.name, categoryName)
        )
    );

    console.log("找到的记录数:", allRecords.length);
    console.log("详细信息:", JSON.stringify(allRecords, null, 2));
}

checkCategory().then(() => process.exit(0)).catch((err) => {
    console.error("查询失败:", err);
    process.exit(1);
});
