import { fetchShareData } from "@/lib/api";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShareReceipt } from "./components/ShareReceipt";

type RouteParams = { params: Promise<{ shareId: string; locale: string }> };

export default async function SharePage({ params }: RouteParams) {
    const { shareId } = await params;
    let shareData;

    try {
        shareData = await fetchShareData(shareId);
    } catch (error) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
            <ShareReceipt data={shareData} />
        </div>
    );
}
