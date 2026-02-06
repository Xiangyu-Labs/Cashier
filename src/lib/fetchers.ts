"use server";

/**
 * Unified Data Fetchers
 * 
 * These fetchers provide a consistent data format for both:
 * 1. Server-side prefetching (page.tsx with HydrationBoundary)
 * 2. Client-side queries (useQuery in components)
 * 
 * The key principle: same queryKey + same data format = perfect hydration
 */

import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getPendingSourceDocumentsAction, getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { Ledger, EntryCategory } from "@/types/api";

// ============================================
// Core Ledger Fetchers
// ============================================

/**
 * Fetch a single ledger by ID
 */
export async function fetchLedger(ledgerId: string): Promise<Ledger | null> {
    const result = await getLedgerAction(ledgerId);
    return result.success ? (result.data as Ledger) : null;
}

/**
 * Fetch all ledgers for the current user
 */
export async function fetchLedgers(): Promise<Ledger[]> {
    const result = await getLedgersAction();
    return result.success ? (result.data as Ledger[]) : [];
}

/**
 * Fetch entry categories for a ledger
 */
export async function fetchEntryCategories(ledgerId: string): Promise<EntryCategory[]> {
    // getEntryCategoriesAction returns array directly
    return getEntryCategoriesAction(ledgerId);
}

// ============================================
// Source Document Fetchers
// ============================================

/**
 * Fetch pending source documents (processing + anomaly)
 */
export async function fetchPendingSourceDocuments(ledgerId: string) {
    return getPendingSourceDocumentsAction(ledgerId);
}

/**
 * Fetch unified source documents with optional filters
 */
export async function fetchUnifiedSourceDocuments(
    ledgerId: string,
    options: { startDate?: string; endDate?: string; cursor?: string | null } = {}
) {
    return getUnifiedSourceDocumentsAction(ledgerId, options);
}
