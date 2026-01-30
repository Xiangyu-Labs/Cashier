import { shares } from "@/lib/db/schema";
import { BaseRepository } from "./base-repository";
import { EntityType } from "@/lib/events/types";
import { eq, and, gt, desc, or, isNull } from "drizzle-orm";
import { InferSelectModel } from "drizzle-orm";

export type Share = InferSelectModel<typeof shares>;

export class ShareRepository extends BaseRepository<Share, typeof shares> {
    constructor() {
        super(shares, 'share', "sourceDocumentId"); // Using sourceDocumentId as a proxy for ledgerId context if needed, though shares are usually public
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
