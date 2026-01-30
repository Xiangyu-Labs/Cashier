import { NextRequest, NextResponse } from "next/server";
import { shareRepo } from "@/lib/repositories";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ shareId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { shareId } = await params;
        const share = await shareRepo.findByShareId(shareId);

        if (!share) {
            return NextResponse.json({ error: "Share not found" }, { status: 404 });
        }

        if (!share.isActive) {
            return NextResponse.json({ error: "Share is no longer active" }, { status: 410 });
        }

        if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
            return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
        }

        // Increment access count (fire and forget)
        shareRepo.incrementAccessCount(shareId).catch(err => {
            logger.error(err, "Failed to increment access count for share", { shareId });
        });

        // Transform data for public consumption
        // We only return what's necessary for the receipt view
        const sourceDocument = share.sourceDocument;
        if (!sourceDocument) {
            return NextResponse.json({ error: "Source document not found" }, { status: 404 });
        }

        // We shouldn't leak the entire sourceDocument object if it contains sensitive info, 
        // but here it seems fine as per requirement "share document".
        // We should ensure we don't leak other parts of the system.

        return NextResponse.json({
            sourceDocument: {
                id: sourceDocument.id,
                title: sourceDocument.title,
                text: sourceDocument.text,
                imageUrls: sourceDocument.imageUrls, // Maybe optional? User requirement says "future... add image sharing", but wait, "show beautiful receipt". 
                // Option C description: "Pseudo-thermal receipt... embedded thumbnail (optional)".
                // Current requirement: "Share entire bill". So we provide data. 
                createdAt: sourceDocument.createdAt,
            },
            entries: sourceDocument.ledgerEntries.map(entry => ({
                id: entry.id,
                amount: entry.amount,
                currency: entry.currency,
                itemName: entry.itemName,
                description: entry.description,
                entryDate: entry.entryDate,
                category: entry.category ? {
                    id: entry.category.id,
                    name: entry.category.name,
                    icon: entry.category.icon
                } : null
            })),
            ledgerId: sourceDocument.ledgerId, // Might be needed for some context, but prefer not to if possible. 
        });

    } catch (error) {
        logger.error(error, "Failed to fetch share data");
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
