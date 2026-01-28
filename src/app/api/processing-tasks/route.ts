// Processing Tasks API
// GET /api/processing-tasks?ledgerId=xxx - Get tasks for a ledger
// POST /api/processing-tasks - Create a new task (internal use)

import { NextRequest, NextResponse } from "next/server";
import { getRecentProcessingTasks, getActiveProcessingTasks } from "@/lib/processing";

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

        const tasks = activeOnly
            ? await getActiveProcessingTasks(ledgerId)
            : await getRecentProcessingTasks(ledgerId, limit);

        return NextResponse.json(tasks);
    } catch (error) {
        console.error("Failed to fetch processing tasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch tasks" },
            { status: 500 }
        );
    }
}
