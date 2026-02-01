import { BaseRepository } from "@/lib/repositories/base-repository";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { InferSelectModel, eq, and } from "drizzle-orm";
import { eventBus } from "@/lib/events/event-bus";

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;

class SourceDocumentRepository extends BaseRepository<SourceDocument, typeof sourceDocuments> {
    constructor() {
        super(sourceDocuments, 'source_document', 'ledgerId', 'sourceDocuments');
    }

    async update(id: string, data: Partial<SourceDocument>, ledgerId: string): Promise<SourceDocument> {
        if (Object.keys(data).length === 0) {
            const [existing] = await this.db.select().from(this.table).where(and(eq(this.table.id, id), eq(this.table.ledgerId, ledgerId)));
            if (!existing) throw new Error(`Entity ${this.entityType} with id ${id} not found`);
            return existing as SourceDocument;
        }

        const [result] = await this.db.update(this.table)
            .set(data)
            .where(and(eq(this.table.id, id), eq(this.table.ledgerId, ledgerId)))
            .returning();

        if (!result) throw new Error(`Entity ${this.entityType} with id ${id} not found or access denied`);

        eventBus.publish({
            type: 'entity:changed',
            ledgerId: ledgerId,
            entity: this.entityType,
            action: 'updated',
            ids: [id],
            metadata: {
                status: result.status
            }
        });

        return result;
    }

    async batchUpdate(ids: string[], data: Partial<SourceDocument>, ledgerId: string): Promise<SourceDocument[]> {
        const results = await super.batchUpdate(ids, data, ledgerId);

        if (results.length > 0) {
            // Re-publish with status metadata (BaseRepository doesn't include metadata)
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId,
                entity: this.entityType,
                action: 'updated',
                ids: results.map(r => r.id),
                metadata: {
                    status: (results[0] as any).status
                }
            });
        }

        return results;
    }

    async setAnomaly(id: string, anomalyCodes: string[], ledgerId: string) {
        return this.update(id, { status: 'anomaly', anomalyCodes }, ledgerId);
    }

    async setProcessing(id: string, ledgerId: string) {
        return this.update(id, { status: 'processing' }, ledgerId);
    }

    async batchComplete(ids: string[], ledgerId: string) {
        return this.batchUpdate(ids, { status: "completed" }, ledgerId);
    }
}

export const sourceDocumentRepo = new SourceDocumentRepository();
