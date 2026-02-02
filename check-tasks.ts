import { db } from "./src/lib/db";
import { taskRuns } from "./src/lib/db/schema";
import { desc } from "drizzle-orm";

async function checkFailedTasks() {
    const tasks = await db.query.taskRuns.findMany({
        orderBy: [desc(taskRuns.createdAt)],
        limit: 20,
    });

    console.log(JSON.stringify(tasks, null, 2));
    process.exit(0);
}

checkFailedTasks().catch(err => {
    console.error(err);
    process.exit(1);
});
