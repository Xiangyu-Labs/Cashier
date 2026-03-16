"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";

interface SettingsPageProps {
    params: Promise<{ id: string }>;
}

export default function SettingsPage({ params }: SettingsPageProps) {
    const { data: session, status } = useSession();
    const router = useRouter();

    // Unwrap params using React.use() pattern for Next.js 15+
    const [ledgerId, setLedgerId] = React.useState<string>("");

    React.useEffect(() => {
        params.then(p => setLedgerId(p.id));
    }, [params]);

    const { data: ledger, isLoading: isLoadingLedger } = useQuery({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => getLedgerAction(ledgerId),
        enabled: !!ledgerId,
    });

    const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
        queryKey: queryKeys.entryCategories(ledgerId),
        queryFn: () => getEntryCategoriesAction(ledgerId),
        enabled: !!ledgerId,
    });

    if (status === "loading" || isLoadingLedger || isLoadingCategories) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-muted rounded w-1/3"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-64 bg-muted rounded"></div>
                </div>
            </div>
        );
    }

    if (!session?.user?.id) {
        router.push("/login");
        return null;
    }

    if (!ledger) {
        return <div>Ledger not found</div>;
    }

    return (
        <SettingsPageClient
            ledger={ledger}
            initialCategories={categories}
            ledgerId={ledgerId}
        />
    );
}

import React from "react";
