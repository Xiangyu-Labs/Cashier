import { entryCategories } from "@/lib/db/schema";
import { BaseRepository } from "./base-repository";
import { InferSelectModel } from "drizzle-orm";

export type EntryCategory = InferSelectModel<typeof entryCategories>;

export class EntryCategoryRepository extends BaseRepository<EntryCategory, typeof entryCategories> {
    constructor() {
        super(entryCategories, 'category', "ledgerId", "entryCategories");
    }
}

export const entryCategoryRepo = new EntryCategoryRepository();
