import { BaseRepository } from "./base-repository";
import { sourceDocuments } from "@/lib/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;

class SourceDocumentRepository extends BaseRepository<SourceDocument, typeof sourceDocuments> {
    constructor() {
        super(sourceDocuments, 'source_document');
    }

    async setError(id: string, errorCode: "internal_error" | "parse_failed" | "invalid_content" | "flow_anomaly" | "unknown_currency", ledgerId?: string) {
        return this.update(id, { status: 'error', errorCode }, ledgerId);
    }

    async setProcessing(id: string, ledgerId?: string) {
        return this.update(id, { status: 'processing' }, ledgerId);
    }



    async batchComplete(ids: string[], ledgerId: string) {
        return this.batchUpdate(ids, { status: "completed" }, ledgerId);
    }
}

export const sourceDocumentRepo = new SourceDocumentRepository();
