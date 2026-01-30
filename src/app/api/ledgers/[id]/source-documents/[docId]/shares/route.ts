import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { z } from "zod";
import { logger } from "@/lib/logger";

const createShareSchema = z.object({
    expiresIn: z.enum(["1d", "7d", "30d", "never"]).optional().default("7d"),
});

type RouteParams = { params: Promise<{ id: string; docId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, docId: sourceDocumentId } = await params;
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

        // Check if there is already an active share
        const existingShare = await shareRepo.findActiveBySourceDocumentId(sourceDocumentId);
        if (existingShare) {
            // Return existing share if it matches expiration policy essentially, or just create a new one?
            // For simplicity, let's just return the existing active one if valid.
            // But user might want to extend it.
            // Let's create a NEW one always for now to support "refreshing" link, but maybe we should deactivate old ones?
            // Actually, plan says "Create a share link".
            // Let's create a new one.
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
