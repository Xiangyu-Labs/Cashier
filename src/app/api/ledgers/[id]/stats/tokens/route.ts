import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gptTasks } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: ledgerId } = await params;

    const stats = await db
        .select({
            totalTasks: sql<number>`count(*)`,
            totalInputTokens: sql<number>`sum(cast(metadata->'usage'->>'inputTokens' as integer))`,
            totalOutputTokens: sql<number>`sum(cast(metadata->'usage'->>'outputTokens' as integer))`,
        })
        .from(gptTasks)
        .where(
            and(
                eq(gptTasks.ledgerId, ledgerId),
                eq(gptTasks.status, "completed")
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
