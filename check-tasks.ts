import { db } from "./src/lib/db";
import { taskRuns } from "./src/lib/db/schema";
import { desc } from "drizzle-orm";

async function checkFailedTasks() {
    const failedTasks = await db.query.taskRuns.findMany({
        orderBy: [desc(taskRuns.createdAt)],
        limit: 5,
    });

    console.log(JSON.stringify(failedTasks, null, 2));
    process.exit(0);
}

checkFailedTasks().catch(err => {
    console.error(err);
    process.exit(1);
});
