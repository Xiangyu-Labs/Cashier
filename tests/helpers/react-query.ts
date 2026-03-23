import type { Query } from "@tanstack/react-query";

export function asQueryLike(queryKey: readonly unknown[]) {
  return { queryKey } as unknown as Query<unknown, Error, unknown, readonly unknown[]>;
}
