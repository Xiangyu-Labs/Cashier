export function escapedLikeContains(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}
