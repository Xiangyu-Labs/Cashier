export interface CategoryCollectionRevisionItem {
  id: string;
  updatedAt: string | Date;
}

/**
 * Hash the complete active category collection in a deterministic order. The
 * revision intentionally includes only identity and server timestamps so
 * client drafts cannot manufacture a revision for uncommitted values.
 */
export async function computeCategoryCollectionRevision(
  categories: readonly CategoryCollectionRevisionItem[]
): Promise<string> {
  const canonical = JSON.stringify(
    [...categories]
      .map((category) => ({
        id: category.id,
        updatedAt:
          category.updatedAt instanceof Date
            ? category.updatedAt.toISOString()
            : category.updatedAt,
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
