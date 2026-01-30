import { BaseRepository } from "./base-repository";
import { sourceDocuments, errorCodeEnum } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;

class SourceDocumentRepository extends BaseRepository<SourceDocument, typeof sourceDocuments> {
    constructor() {
        super(sourceDocuments, 'source_document');
    }

    async setError(id: string, errorCode: "internal_error" | "parse_failed" | "invalid_content", ledgerId?: string) {
        return this.update(id, { status: 'error', errorCode }, ledgerId);
    }

    async setProcessing(id: string, ledgerId?: string) {
        return this.update(id, { status: 'processing' }, ledgerId);
    }

    async completeAllToConfirm(ledgerId: string) {
        const { and, eq } = await import("drizzle-orm");
        const results = await this.db.update(this.table)
            .set({ status: "completed" })
            .where(and(eq(this.table.ledgerId, ledgerId), eq(this.table.status, "to_confirm")))
            .returning();

        if (results.length > 0) {
            const { eventBus } = await import("@/lib/events/event-bus");
            eventBus.publish({
                type: 'entity:changed',
                ledgerId,
                entity: this.entityType,
                action: 'updated',
                ids: results.map(r => r.id)
            });
        }
        return results;
    }

    async batchComplete(ids: string[], ledgerId: string) {
        return this.batchUpdate(ids, { status: "completed" }, ledgerId);
    }
}

export const sourceDocumentRepo = new SourceDocumentRepository();
