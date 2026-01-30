import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string; shareId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { shareId } = await params;

        await shareRepo.update(shareId, { isActive: false });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error(error, "Failed to delete share");
        return NextResponse.json(
            { error: "Failed to delete share" },
            { status: 500 }
        );
    }
}
