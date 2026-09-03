CREATE OR REPLACE FUNCTION record_ledger_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_ledger_id uuid;
  change_version bigint;
  change_kind text := TG_ARGV[0];
  new_row jsonb := coalesce(to_jsonb(NEW), '{}'::jsonb);
  old_row jsonb := coalesce(to_jsonb(OLD), '{}'::jsonb);
BEGIN
  target_ledger_id := CASE WHEN change_kind = 'settings'
    THEN coalesce(new_row->>'id', old_row->>'id')::uuid
    ELSE coalesce(new_row->>'ledger_id', old_row->>'ledger_id')::uuid
  END;
  IF NOT EXISTS (SELECT 1 FROM ledgers WHERE id = target_ledger_id) THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  INSERT INTO ledger_sync_state(ledger_id, version, updated_at)
  VALUES (target_ledger_id, 0, now()) ON CONFLICT (ledger_id) DO NOTHING;
  SELECT version INTO change_version FROM ledger_change_batches
  WHERE ledger_id = target_ledger_id AND transaction_id = txid_current();
  IF change_version IS NULL THEN
    UPDATE ledger_sync_state SET version = version + 1, updated_at = now()
    WHERE ledger_id = target_ledger_id RETURNING version INTO change_version;
    INSERT INTO ledger_change_batches(ledger_id, version, transaction_id)
    VALUES (target_ledger_id, change_version, txid_current());
  END IF;
  UPDATE ledger_change_batches SET
    categories_changed = categories_changed OR change_kind = 'category',
    settings_changed = settings_changed OR change_kind = 'settings',
    stats_changed = stats_changed OR change_kind IN ('document', 'entry', 'category', 'settings'),
    reset_required = reset_required OR (
      change_kind = 'settings' AND old_row->>'main_currency' IS DISTINCT FROM new_row->>'main_currency'
    )
  WHERE ledger_id = target_ledger_id AND version = change_version;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
DROP TABLE "ledger_change_items" CASCADE;--> statement-breakpoint
ALTER TABLE "ledger_change_batches" DROP COLUMN "counts_changed";
