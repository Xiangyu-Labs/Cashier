export function effectiveDocumentDate(input: {
  entryDate: string | null;
  createdAt: string;
}): string {
  return input.entryDate ?? input.createdAt.slice(0, 10);
}

export function matchesLiteralEntrySearch(
  entry: { itemName: string; description?: string | null },
  search: string | null | undefined
): boolean {
  const query = search?.trim().toLocaleLowerCase();
  if (query == null || query === "") return true;
  return [entry.itemName, entry.description]
    .filter((value): value is string => value != null && value !== "")
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}
