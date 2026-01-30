import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";

const createShareSchema = z.object({
    expiresIn: z.enum(["1d", "7d", "30d", "never"]).optional().default("7d"),
});

type RouteParams = { params: Promise<{ id: string; sourceDocumentId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, sourceDocumentId } = await params;

        // Verify user owns this ledger
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return error;

        const body = await request.json();
        const validated = createShareSchema.parse(body);

        let expiresAt: Date | null = null;
        const now = new Date();

        switch (validated.expiresIn) {
            case "1d":
                expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case "7d":
                expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            case "30d":
                expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                break;
            case "never":
                expiresAt = null;
                break;
        }

        const share = await shareRepo.create({
            sourceDocumentId,
            expiresAt: expiresAt,
            isActive: true,
            accessCount: 0,
        }, ledgerId);

        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/s/${share.id}`;

        return NextResponse.json({
            id: share.id,
            shareUrl,
            expiresAt: share.expiresAt,
        });
    } catch (error) {
        logger.error(error, "Failed to create share");
        return NextResponse.json(
            { error: "Failed to create share" },
            { status: 500 }
        );
    }
}
