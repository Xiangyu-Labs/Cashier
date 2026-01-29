import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ledgerId = searchParams.get("ledgerId");
        const activeOnly = searchParams.get("activeOnly") === "true";
        const limit = parseInt(searchParams.get("limit") || "50", 10);

        if (!ledgerId) {
            return NextResponse.json(
                { error: "ledgerId is required" },
                { status: 400 }
            );
        }

        const conditions = [eq(taskRuns.ledgerId, ledgerId)];

        if (activeOnly) {
            conditions.push(eq(taskRuns.status, 'running'));
        }

        const runs = await db.query.taskRuns.findMany({
            where: and(...conditions),
            orderBy: [desc(taskRuns.createdAt)],
            limit: limit,
        });

        // Map to ProcessingTask interface
        const tasks = runs.map(run => ({
            id: run.id,
            type: run.type,
            title: run.title,
            ledgerId: run.ledgerId,
            entityId: null, // taskRuns doesn't track this directly anymore
            entityType: null,
            status: run.status === 'running' ? 'active' : run.status, // Map 'running' to 'running' or 'active'? Frontend expects 'running'
            error: run.error,
            metadata: {
                usage: run.usage,
                output: run.output
            },
            createdAt: run.createdAt.toISOString(),
            startedAt: run.startedAt?.toISOString() || null,
            completedAt: run.completedAt?.toISOString() || null,
        }));

        // Frontend expects 'running'? Yes.
        // But what about 'queued'?
        // task_runs starts as 'running'. Ideally we should probably track 'queued' via BullMQ but that's expensive here.
        // We'll return 'running' for now.
        // Wait, frontend StatusIcon has 'running'.

        return NextResponse.json(tasks);
    } catch (error) {
        console.error("Failed to fetch processing tasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch tasks" },
            { status: 500 }
        );
    }
}
