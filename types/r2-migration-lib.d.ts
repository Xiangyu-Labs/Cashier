declare module "../scripts/r2-migration-lib.mjs" {
  export function assertSafeObjectKey(key: string): string;
  export function sha256(value: Uint8Array | string): string;
  export function verifyFileContents(
    row: { byte_size: number; checksum: string | null },
    localBytes: Uint8Array,
    r2Bytes: Uint8Array
  ): { failures: string[]; localHash: string; r2Hash: string };
  export function verifyLocalContents(
    row: { byte_size: number; checksum: string | null },
    localBytes: Uint8Array
  ): { failures: string[]; localHash: string };
  export function parseMode(argv: string[]): "dry-run" | "upload" | "apply" | "rollback" | "smoke";
  export function requireMaintenanceConfirmation(mode: string, argv: string[]): void;
}
