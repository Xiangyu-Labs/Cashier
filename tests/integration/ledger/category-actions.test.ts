import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../setup";
import {
    ledgers,
    ledgerEntries,
    entryCategories,
    users,
} from "@/lib/db/schema";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

vi.mock("@/lib/flow", () => ({
    flowEngine: {
        submit: vi.fn().mockResolvedValue("mock-task-id"),
        cancel: vi.fn().mockResolvedValue(undefined),
        register: vi.fn(),
        getStatus: vi.fn(),
    },
}));

import { flowEngine } from "@/lib/flow";
import {
    createEntryCategoryAction,
    deleteEntryCategoryAction,
    reorderEntryCategoriesAction,
    getEntryCategoriesAction,
} from "@/features/ledger/server/actions/categories";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("createEntryCategoryAction", () => {
    let ledgerId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        const db = getTestDb();
        ledgerId = uuidv4();
        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("creates a category and returns it", async () => {
        const result = await createEntryCategoryAction(ledgerId, {
            name: "餐饮",
            description: "食物相关",
            icon: "🍽️",
        });

        expect(result.name).toBe("餐饮");
        expect(result.ledgerId).toBe(ledgerId);
        expect(result.id).toBeDefined();
    });

    it("triggers AI metadata generation when icon is missing", async () => {
        await createEntryCategoryAction(ledgerId, {
            name: "餐饮",
            description: "食物相关",
            // no icon
        });

        expect(flowEngine.submit).toHaveBeenCalledWith(
            "generate_category_metadata",
            expect.objectContaining({ categoryName: "餐饮", ledgerId }),
            expect.any(Object)
        );
    });

    it("triggers AI metadata generation when description is missing", async () => {
        await createEntryCategoryAction(ledgerId, {
            name: "交通",
            icon: "🚗",
            // no description
        });

        expect(flowEngine.submit).toHaveBeenCalled();
    });

    it("does not trigger AI when both icon and description are provided", async () => {
        await createEntryCategoryAction(ledgerId, {
            name: "餐饮",
            description: "食物相关",
            icon: "🍽️",
        });

        expect(flowEngine.submit).not.toHaveBeenCalled();
    });

    it("different ledgers can have same category name (tenant isolation)", async () => {
        const db = getTestDb();
        const ledgerId2 = uuidv4();
        const otherUserId = uuidv4();

        // Create another user first with unique email
        await db.insert(users).values({
            id: otherUserId,
            email: `other-${uuidv4()}@example.com`,
            name: "Other User",
            emailVerified: new Date(),
        }).onConflictDoNothing();

        await db.insert(ledgers).values({
            id: ledgerId2,
            userId: otherUserId,
            name: "Second Ledger",
            metadata: {},
        });

        // Create categories for each ledger directly in DB (bypassing action auth checks)
        const catId1 = uuidv4();
        const catId2 = uuidv4();
        await db.insert(entryCategories).values({
            id: catId1,
            ledgerId,
            name: "餐饮",
            description: "食物",
            icon: "🍽️",
            sortOrder: 1,
        });
        await db.insert(entryCategories).values({
            id: catId2,
            ledgerId: ledgerId2,
            name: "餐饮",
            description: "食物",
            icon: "🍽️",
            sortOrder: 1,
        });

        // Verify categories exist and belong to correct ledgers
        const cat1 = await db.query.entryCategories.findFirst({ where: eq(entryCategories.id, catId1) });
        const cat2 = await db.query.entryCategories.findFirst({ where: eq(entryCategories.id, catId2) });

        expect(cat1?.id).not.toBe(cat2?.id);
        expect(cat1?.ledgerId).toBe(ledgerId);
        expect(cat2?.ledgerId).toBe(ledgerId2);
        expect(cat1?.name).toBe("餐饮");
        expect(cat2?.name).toBe("餐饮");
    });

    it("throws 'Unauthorized' for wrong ledger", async () => {
        await expect(
            createEntryCategoryAction(uuidv4(), { name: "Test", description: "d", icon: "x" })
        ).rejects.toThrow("Unauthorized");
    });
});

describe("deleteEntryCategoryAction", () => {
    let ledgerId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        const db = getTestDb();
        ledgerId = uuidv4();
        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("soft-deletes the category", async () => {
        const db = getTestDb();
        const catId = uuidv4();
        await db.insert(entryCategories).values({
            id: catId,
            ledgerId,
            name: "餐饮",
            sortOrder: 1,
        });

        await deleteEntryCategoryAction(ledgerId, catId);

        const cat = await db.query.entryCategories.findFirst({
            where: eq(entryCategories.id, catId),
        });
        expect(cat?.deletedAt).not.toBeNull();
    });

    it("nullifies categoryId on associated entries", async () => {
        const db = getTestDb();
        const catId = uuidv4();
        await db.insert(entryCategories).values({
            id: catId,
            ledgerId,
            name: "餐饮",
            sortOrder: 1,
        });

        const [doc] = await db.insert(sourceDocuments).values({
            id: uuidv4(),
            ledgerId,
            text: "test",
            status: "completed",
            type: "ai_parsed",
            imageUrls: [],
        }).returning();

        const [entry] = await db.insert(ledgerEntries).values({
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: "午餐",
            amount: "25.00",
            currency: "CNY",
            categoryId: catId,
        }).returning();

        await deleteEntryCategoryAction(ledgerId, catId);

        const updatedEntry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, entry.id),
        });
        expect(updatedEntry?.categoryId).toBeNull();
    });
});

describe("reorderEntryCategoriesAction", () => {
    let ledgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        ledgerId = uuidv4();
        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("updates sortOrder for each category", async () => {
        const db = getTestDb();
        const id1 = uuidv4();
        const id2 = uuidv4();
        const id3 = uuidv4();

        await db.insert(entryCategories).values([
            { id: id1, ledgerId, name: "A", sortOrder: 0 },
            { id: id2, ledgerId, name: "B", sortOrder: 1 },
            { id: id3, ledgerId, name: "C", sortOrder: 2 },
        ]);

        // Reorder: C, A, B
        await reorderEntryCategoriesAction(ledgerId, [id3, id1, id2]);

        const cats = await db.query.entryCategories.findMany({
            where: eq(entryCategories.ledgerId, ledgerId),
        });
        const byId = Object.fromEntries(cats.map(c => [c.id, c.sortOrder]));
        expect(byId[id3]).toBe(0);
        expect(byId[id1]).toBe(1);
        expect(byId[id2]).toBe(2);
    });
});

describe("getEntryCategoriesAction", () => {
    let ledgerId: string;

    beforeEach(async () => {
        const db = getTestDb();
        ledgerId = uuidv4();
        await db.insert(ledgers).values({
            id: ledgerId,
            userId: TEST_USER_ID,
            name: "Test Ledger",
            metadata: {},
        });
    });

    it("returns categories sorted by sortOrder", async () => {
        const db = getTestDb();
        await db.insert(entryCategories).values([
            { id: uuidv4(), ledgerId, name: "B", sortOrder: 2 },
            { id: uuidv4(), ledgerId, name: "A", sortOrder: 1 },
            { id: uuidv4(), ledgerId, name: "C", sortOrder: 3 },
        ]);

        const result = await getEntryCategoriesAction(ledgerId);
        expect(result.map(c => c.name)).toEqual(["A", "B", "C"]);
    });

    it("excludes soft-deleted categories", async () => {
        const db = getTestDb();
        await db.insert(entryCategories).values([
            { id: uuidv4(), ledgerId, name: "Active", sortOrder: 1 },
            { id: uuidv4(), ledgerId, name: "Deleted", sortOrder: 2, deletedAt: new Date() },
        ]);

        const result = await getEntryCategoriesAction(ledgerId);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Active");
    });

    it("includes entry count per category", async () => {
        const db = getTestDb();
        const catId = uuidv4();
        await db.insert(entryCategories).values({
            id: catId,
            ledgerId,
            name: "餐饮",
            sortOrder: 1,
        });

        const [doc] = await db.insert(sourceDocuments).values({
            id: uuidv4(),
            ledgerId,
            text: "test",
            status: "completed",
            type: "ai_parsed",
            imageUrls: [],
        }).returning();

        await db.insert(ledgerEntries).values([
            {
                id: uuidv4(),
                ledgerId,
                sourceDocumentId: doc.id,
                itemName: "Item 1",
                amount: "10.00",
                currency: "CNY",
                categoryId: catId,
            },
            {
                id: uuidv4(),
                ledgerId,
                sourceDocumentId: doc.id,
                itemName: "Item 2",
                amount: "20.00",
                currency: "CNY",
                categoryId: catId,
            },
        ]);

        const result = await getEntryCategoriesAction(ledgerId);
        expect(result[0].entryCount).toBe(2);
    });
});
