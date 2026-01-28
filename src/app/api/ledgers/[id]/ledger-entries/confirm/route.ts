import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries, sourceDocuments, entryCategories } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

const confirmSchema = z.object({
    ledgerEntryIds: z.array(z.string()).optional(),
    confirmAll: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

interface ProposedLedgerEntry {
    category?: string;
    amount?: number | string;
    currency?: string;
    itemName?: string;
    notes?: string;
    transactionDate?: string;
}

// POST /api/ledgers/[id]/ledger-entries/confirm - 确认账目
export async function POST(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id: ledgerId } = await params;
        const body = await request.json();
        const { ledgerEntryIds, confirmAll } = confirmSchema.parse(body);

        if (confirmAll) {
            // Logic for confirming ALL pending source documents
            const pendingDocs = await db.query.sourceDocuments.findMany({
                where: and(
                    eq(sourceDocuments.ledgerId, ledgerId),
                    eq(sourceDocuments.status, "to_confirm")
                ),
            });

            if (pendingDocs.length === 0) {
                return NextResponse.json({ success: true, updatedCount: 0 });
            }

            const allCategories = await db.query.entryCategories.findMany({
                where: eq(entryCategories.ledgerId, ledgerId),
            });

            let count = 0;

            for (const doc of pendingDocs) {
                if (!doc.proposedLedgerEntries || !Array.isArray(doc.proposedLedgerEntries)) {
                    await db.update(sourceDocuments).set({ status: 'completed' }).where(eq(sourceDocuments.id, doc.id));
                    continue;
                }

                const proposedEntries = doc.proposedLedgerEntries as unknown as ProposedLedgerEntry[];

                for (const entry of proposedEntries) {
                    const categoryName = entry.category;
                    const category = allCategories.find(c => c.name === categoryName);

                    await db.insert(ledgerEntries).values({
                        ledgerId: doc.ledgerId,
                        categoryId: category?.id || null,
                        sourceDocumentId: doc.id,
                        amount: entry.amount?.toString() || "0",
                        currency: entry.currency || "CNY",
                        itemName: entry.itemName || "未分类",
                        description: entry.notes || null,
                        transactionDate: entry.transactionDate ? new Date(entry.transactionDate) : new Date(doc.createdAt),
                    });
                    count++;
                }

                await db
                    .update(sourceDocuments)
                    .set({ status: "completed" })
                    .where(eq(sourceDocuments.id, doc.id));
            }

            return NextResponse.json({ success: true, updatedCount: count });
        }

        if (!ledgerEntryIds || ledgerEntryIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Logic for confirming specific ledger entries (by ID list)
        // IDs are in format: "pending:sourceDocumentId:index"
        const docGroups: Record<string, number[]> = {};

        for (const id of ledgerEntryIds) {
            if (!id.startsWith("pending:")) continue;
            const parts = id.split(":");
            if (parts.length !== 3) continue;
            const sourceDocumentId = parts[1];
            const idx = parseInt(parts[2], 10);

            if (!docGroups[sourceDocumentId]) {
                docGroups[sourceDocumentId] = [];
            }
            docGroups[sourceDocumentId].push(idx);
        }

        const docIds = Object.keys(docGroups);
        if (docIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        const pendingDocs = await db.query.sourceDocuments.findMany({
            where: and(
                eq(sourceDocuments.ledgerId, ledgerId),
                inArray(sourceDocuments.id, docIds),
                eq(sourceDocuments.status, "to_confirm")
            )
        });

        const allCategories = await db.query.entryCategories.findMany({
            where: eq(entryCategories.ledgerId, ledgerId),
        });

        let updatedCount = 0;

        for (const doc of pendingDocs) {
            const indices = docGroups[doc.id];
            if (!doc.proposedLedgerEntries || !Array.isArray(doc.proposedLedgerEntries)) continue;

            const proposedEntries = doc.proposedLedgerEntries as unknown as ProposedLedgerEntry[];

            for (const idx of indices) {
                const entry = proposedEntries[idx];
                if (!entry) continue;

                const categoryName = entry.category;
                const category = allCategories.find(c => c.name === categoryName);

                await db.insert(ledgerEntries).values({
                    ledgerId: doc.ledgerId,
                    categoryId: category?.id || null,
                    sourceDocumentId: doc.id,
                    amount: entry.amount?.toString() || "0",
                    currency: entry.currency || "CNY",
                    itemName: entry.itemName || "未分类",
                    description: entry.notes || null,
                    transactionDate: entry.transactionDate ? new Date(entry.transactionDate) : new Date(doc.createdAt),
                });
                updatedCount++;
            }

            await db.update(sourceDocuments)
                .set({ status: 'completed' })
                .where(eq(sourceDocuments.id, doc.id));
        }

        return NextResponse.json({ success: true, updatedCount });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to confirm ledger entries:", error);
        return NextResponse.json(
            { error: "Failed to confirm ledger entries" },
            { status: 500 }
        );
    }
}
