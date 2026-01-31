import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireLedgerAccess } from "@/lib/auth/helpers";

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

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);

        if (error) return error;

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
            status: run.status as "running" | "completed" | "failed",
            error: run.error,
            metadata: {
                usage: run.usage,
                output: run.output
            },
            createdAt: run.createdAt.toISOString(),
            startedAt: run.startedAt?.toISOString() || null,
            completedAt: run.completedAt?.toISOString() || null,
        }));

        return NextResponse.json(tasks);
    } catch (error) {
        console.error("Failed to fetch processing tasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch tasks" },
            { status: 500 }
        );
    }
}
