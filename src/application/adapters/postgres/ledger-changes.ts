import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerSyncState } from "@/persistence";
import type { LedgerChangeReadPort } from "@/modules/source-document/application/ports";

interface ChangeSummaryRow extends Record<string, unknown> {
  currentVersion: string;
  firstRetainedVersion: string | null;
  lastRetainedVersion: string | null;
  categoriesChanged: boolean;
  settingsChanged: boolean;
  statsChanged: boolean;
  resetRequired: boolean;
  hasTransitionalWork: boolean;
}

export const postgresLedgerChangeReadAdapter: LedgerChangeReadPort = {
  async getVersion(ledgerId) {
    const state = await db.query.ledgerSyncState.findFirst({
      where: eq(ledgerSyncState.ledgerId, ledgerId),
      columns: { version: true },
    });
    return state?.version ?? BigInt(0);
  },

  async summarizeChanges({ ledgerId, afterVersion }) {
    const result = await db.execute<ChangeSummaryRow>(sql`
      WITH sync_state AS (
        SELECT COALESCE(
          (SELECT version FROM ledger_sync_state WHERE ledger_id = ${ledgerId}),
          0
        )::text AS current_version
      ), change_summary AS (
        SELECT
          min(batch.version)::text AS first_retained_version,
          max(batch.version)::text AS last_retained_version,
          COALESCE(bool_or(batch.categories_changed), false) AS categories_changed,
          COALESCE(bool_or(batch.settings_changed), false) AS settings_changed,
          COALESCE(bool_or(batch.stats_changed), false) AS stats_changed,
          COALESCE(bool_or(batch.reset_required), false) AS reset_required
        FROM ledger_change_batches batch
        CROSS JOIN sync_state state
        WHERE batch.ledger_id = ${ledgerId}
          AND batch.version > ${afterVersion}
          AND batch.version <= state.current_version::bigint
      )
      SELECT
        state.current_version AS "currentVersion",
        summary.first_retained_version AS "firstRetainedVersion",
        summary.last_retained_version AS "lastRetainedVersion",
        summary.categories_changed AS "categoriesChanged",
        summary.settings_changed AS "settingsChanged",
        summary.stats_changed AS "statsChanged",
        summary.reset_required AS "resetRequired",
        EXISTS (
          SELECT 1
          FROM source_documents document
          WHERE document.ledger_id = ${ledgerId}
            AND document.deleted_at IS NULL
            AND document.current_status = 'processing'
        ) AS "hasTransitionalWork"
      FROM sync_state state
      CROSS JOIN change_summary summary
    `);
    const row = result.rows[0];
    if (row == null) {
      throw new Error("Ledger refresh summary returned no row");
    }
    return {
      currentVersion: BigInt(row.currentVersion),
      firstRetainedVersion:
        row.firstRetainedVersion == null ? null : BigInt(row.firstRetainedVersion),
      lastRetainedVersion: row.lastRetainedVersion == null ? null : BigInt(row.lastRetainedVersion),
      categoriesChanged: row.categoriesChanged,
      settingsChanged: row.settingsChanged,
      statsChanged: row.statsChanged,
      resetRequired: row.resetRequired,
      hasTransitionalWork: row.hasTransitionalWork,
    };
  },
};
