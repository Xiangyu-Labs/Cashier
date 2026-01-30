import { BaseRepository } from "./base-repository";
import { sourceDocuments } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;

class SourceDocumentRepository extends BaseRepository<SourceDocument, typeof sourceDocuments> {
    constructor() {
        super(sourceDocuments, 'source_document');
    }

    async setAnomaly(id: string, anomalyCodes: string[], ledgerId?: string) {
        return this.update(id, { status: 'anomaly', anomalyCodes }, ledgerId);
    }

    async setProcessing(id: string, ledgerId?: string) {
        return this.update(id, { status: 'processing' }, ledgerId);
    }



    async batchComplete(ids: string[], ledgerId: string) {
        return this.batchUpdate(ids, { status: "completed" }, ledgerId);
    }
}

export const sourceDocumentRepo = new SourceDocumentRepository();
