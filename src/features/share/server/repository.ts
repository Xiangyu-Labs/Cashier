import { shares } from "./schema";
import { BaseRepository } from "@/lib/repositories/base-repository";
import { eq, and, gt, desc, or, isNull, InferSelectModel } from "drizzle-orm";

export type Share = InferSelectModel<typeof shares>;

export class ShareRepository extends BaseRepository<Share, typeof shares> {
    constructor() {
        super(shares, 'share', "ledgerId", "shares");
    }

    async findActiveBySourceDocumentId(sourceDocumentId: string) {
        return this.db.query.shares.findFirst({
            where: and(
                eq(shares.sourceDocumentId, sourceDocumentId),
                eq(shares.isActive, true),
                or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date()))
            ),
            orderBy: [desc(shares.createdAt)],
        });
    }

    async findByShareId(id: string) {
        return this.db.query.shares.findFirst({
            where: eq(shares.id, id),
            with: {
                sourceDocument: {
                    with: {
                        ledgerEntries: {
                            with: {
                                category: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async incrementAccessCount(id: string) {
        const share = await this.db.query.shares.findFirst({
            where: eq(shares.id, id),
        });

        if (share) {
            await this.db
                .update(shares)
                .set({ accessCount: share.accessCount + 1 })
                .where(eq(shares.id, id));
        }
    }
}

export const shareRepo = new ShareRepository();
