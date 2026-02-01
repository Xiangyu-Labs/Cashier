import { notFound } from "next/navigation";
import { ShareReceipt } from "./components/ShareReceipt";
import { getPublicShareAction } from "@/features/ledger/server/actions/shares";

type RouteParams = { params: Promise<{ shareId: string; locale: string }> };

export default async function SharePage({ params }: RouteParams) {
    const { shareId } = await params;

    const result = await getPublicShareAction(shareId);

    if (!result.success || !result.data) {
        // If error status is 410, we could show expired page.
        // For now, consistent with previous behavior:
        if (result.status === 410) {
            notFound(); // Or custom expired UI
        }
        notFound();
    }

    return (
        <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
            <ShareReceipt data={result.data} />
        </div>
    );
}
