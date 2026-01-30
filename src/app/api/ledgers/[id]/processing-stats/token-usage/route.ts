import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireLedgerAccess } from "@/lib/auth/helpers";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: ledgerId } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) return error;

    const stats = await db
        .select({
            totalTasks: sql<number>`count(*)`,
            totalInputTokens: sql<number>`sum(cast(usage->>'inputTokens' as integer))`,
            totalOutputTokens: sql<number>`sum(cast(usage->>'outputTokens' as integer))`,
        })
        .from(taskRuns)
        .where(
            and(
                eq(taskRuns.ledgerId, ledgerId),
                eq(taskRuns.status, "completed")
            )
        );

    const result = stats[0] || { totalTasks: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const totalInput = Number(result.totalInputTokens) || 0;
    const totalOutput = Number(result.totalOutputTokens) || 0;
    const count = Number(result.totalTasks) || 0;

    return NextResponse.json({
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
        taskCount: count,
        averageTokensPerTask: count > 0 ? Math.round((totalInput + totalOutput) / count) : 0
    });
}
