import { shareRepo } from "@/lib/repositories/share-repository";
import { notFound } from "next/navigation";
import { ShareReceipt } from "./components/ShareReceipt";
import { ShareData } from "@/types/api";

type RouteParams = { params: Promise<{ shareId: string; locale: string }> };

export default async function SharePage({ params }: RouteParams) {
    const { shareId } = await params;

    const share = await shareRepo.findByShareId(shareId);

    if (!share) {
        notFound();
    }

    if (!share.isActive || (share.expiresAt && new Date(share.expiresAt) < new Date())) {
        // We could show a specific "Expired" page, but for now matching the API's 410 logic
        // or just let it 404. Let's redirect to a nicely handled 404 or just return 404 for now.
        notFound();
    }

    // Increment access count
    shareRepo.incrementAccessCount(shareId).catch(() => { });

    if (!share.sourceDocument) {
        notFound();
    }

    const shareData: ShareData = {
        sourceDocument: {
            id: share.sourceDocument.id,
            title: share.sourceDocument.title,
            text: share.sourceDocument.text,
            imageUrls: share.sourceDocument.imageUrls || [],
            createdAt: share.sourceDocument.createdAt.toISOString(),
        },
        entries: share.sourceDocument.ledgerEntries.map(entry => ({
            id: entry.id,
            amount: entry.amount,
            currency: entry.currency,
            itemName: entry.itemName,
            description: entry.description,
            entryDate: entry.entryDate ? entry.entryDate.toISOString() : null,
            category: entry.category ? {
                id: entry.category.id,
                name: entry.category.name,
                icon: entry.category.icon
            } : null
        })),
        ledgerId: share.sourceDocument.ledgerId,
    };

    return (
        <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
            <ShareReceipt data={shareData} />
        </div>
    );
}
