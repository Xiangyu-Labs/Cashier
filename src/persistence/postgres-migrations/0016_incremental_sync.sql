DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ledgers
    WHERE metadata IS NULL OR jsonb_typeof(metadata) <> 'object'
       OR (metadata ? 'settings' AND jsonb_typeof(metadata->'settings') <> 'object')
       OR (metadata->'settings' ? 'currencies' AND jsonb_typeof(metadata->'settings'->'currencies') <> 'array')
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(coalesce(metadata->'settings'->'currencies', '[]'::jsonb)) currency
         WHERE currency !~ '^[A-Z]{3}$'
       )
       OR coalesce(metadata->'settings'->>'mainCurrency', 'CNY') !~ '^[A-Z]{3}$'
       OR length(coalesce(metadata->'settings'->>'aiLanguage', 'zh-CN')) NOT BETWEEN 2 AND 35
       OR length(coalesce(metadata->'settings'->>'aiCustomPrompt', '')) > 4000
       OR length(coalesce(metadata->'settings'->>'timeZone', '')) > 50
       OR (metadata->'settings' ? 'collapseEntriesDefault'
           AND jsonb_typeof(metadata->'settings'->'collapseEntriesDefault') <> 'boolean')
  ) THEN
    RAISE EXCEPTION 'incremental sync migration blocked: invalid ledger settings metadata';
  END IF;

  IF EXISTS (
    SELECT 1 FROM processing_outbox
    WHERE payload IS NULL OR jsonb_typeof(payload) <> 'object'
       OR NOT (payload ? 'sourceDocumentId')
       OR NOT pg_input_is_valid(payload->>'sourceDocumentId', 'uuid')
       OR (payload ? 'requestedAt' AND NOT pg_input_is_valid(payload->>'requestedAt', 'timestamptz'))
  ) THEN
    RAISE EXCEPTION 'incremental sync migration blocked: invalid processing outbox payload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM idempotency_records record
    WHERE record.key !~ '^api-v1:[0-9a-fA-F-]{36}:.+$'
       OR NOT pg_input_is_valid(split_part(record.key, ':', 2), 'uuid')
       OR NOT EXISTS (
         SELECT 1 FROM service_credentials credential
         WHERE credential.id::text = split_part(record.key, ':', 2)
       )
  ) THEN
    RAISE EXCEPTION 'incremental sync migration blocked: unmappable idempotency key';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE ledgers ADD COLUMN ai_language text;
ALTER TABLE ledgers ADD COLUMN preferred_currencies varchar(3)[];
ALTER TABLE ledgers ADD COLUMN main_currency varchar(3);
ALTER TABLE ledgers ADD COLUMN collapse_entries_default boolean;
ALTER TABLE ledgers ADD COLUMN ai_custom_prompt text;
ALTER TABLE ledgers ADD COLUMN time_zone text;
UPDATE ledgers SET
  ai_language = coalesce(metadata->'settings'->>'aiLanguage', 'zh-CN'),
  preferred_currencies = ARRAY(
    SELECT jsonb_array_elements_text(coalesce(metadata->'settings'->'currencies', '[]'::jsonb))
  ),
  main_currency = coalesce(metadata->'settings'->>'mainCurrency', 'CNY'),
  collapse_entries_default = coalesce((metadata->'settings'->>'collapseEntriesDefault')::boolean, false),
  ai_custom_prompt = coalesce(metadata->'settings'->>'aiCustomPrompt', ''),
  time_zone = nullif(metadata->'settings'->>'timeZone', '');
ALTER TABLE ledgers ALTER COLUMN ai_language SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN ai_language SET DEFAULT 'zh-CN';
ALTER TABLE ledgers ALTER COLUMN preferred_currencies SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN preferred_currencies SET DEFAULT ARRAY[]::varchar(3)[];
ALTER TABLE ledgers ALTER COLUMN main_currency SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN main_currency SET DEFAULT 'CNY';
ALTER TABLE ledgers ALTER COLUMN collapse_entries_default SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN collapse_entries_default SET DEFAULT false;
ALTER TABLE ledgers ALTER COLUMN ai_custom_prompt SET NOT NULL;
ALTER TABLE ledgers ALTER COLUMN ai_custom_prompt SET DEFAULT '';
ALTER TABLE ledgers ADD CONSTRAINT ck_ledgers_main_currency CHECK (main_currency ~ '^[A-Z]{3}$');
ALTER TABLE ledgers ADD CONSTRAINT ck_ledgers_preferred_currencies CHECK (
  cardinality(preferred_currencies) <= 32 AND (
    cardinality(preferred_currencies) = 0 OR
    array_to_string(preferred_currencies, ',') ~ '^([A-Z]{3})(,[A-Z]{3})*$'
  )
);
ALTER TABLE ledgers ADD CONSTRAINT ck_ledgers_ai_language_length CHECK (length(ai_language) BETWEEN 2 AND 35);
ALTER TABLE ledgers ADD CONSTRAINT ck_ledgers_ai_custom_prompt_length CHECK (length(ai_custom_prompt) <= 4000);
ALTER TABLE ledgers ADD CONSTRAINT ck_ledgers_time_zone_length CHECK (time_zone IS NULL OR length(time_zone) <= 50);
ALTER TABLE ledgers DROP COLUMN metadata;
--> statement-breakpoint
ALTER TABLE processing_outbox ADD COLUMN source_document_id uuid;
ALTER TABLE processing_outbox ADD COLUMN requested_at timestamptz;
UPDATE processing_outbox SET
  source_document_id = (payload->>'sourceDocumentId')::uuid,
  requested_at = coalesce((payload->>'requestedAt')::timestamptz, created_at);
ALTER TABLE processing_outbox ALTER COLUMN source_document_id SET NOT NULL;
ALTER TABLE processing_outbox ALTER COLUMN requested_at SET NOT NULL;
ALTER TABLE processing_outbox ALTER COLUMN requested_at SET DEFAULT now();
ALTER TABLE processing_outbox ADD CONSTRAINT fk_processing_outbox_document_ledger
  FOREIGN KEY (ledger_id, source_document_id)
  REFERENCES source_documents(ledger_id, id) ON DELETE CASCADE;
DROP INDEX IF EXISTS uq_processing_outbox_idempotency_key;
ALTER TABLE processing_outbox DROP COLUMN idempotency_key;
ALTER TABLE processing_outbox DROP COLUMN payload;
--> statement-breakpoint
ALTER TABLE idempotency_records ADD COLUMN credential_id uuid;
ALTER TABLE idempotency_records ADD COLUMN scoped_key text;
ALTER TABLE idempotency_records ADD COLUMN lease_token uuid;
ALTER TABLE idempotency_records ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE idempotency_records ADD COLUMN expires_at timestamptz;
UPDATE idempotency_records SET
  credential_id = split_part(key, ':', 2)::uuid,
  scoped_key = substring(key FROM length('api-v1:') + length(split_part(key, ':', 2)) + 2),
  lease_token = CASE WHEN status = 'pending' THEN gen_random_uuid() ELSE NULL END,
  lease_expires_at = CASE WHEN status = 'pending' THEN now() + interval '30 seconds' ELSE NULL END,
  expires_at = coalesce(completed_at, created_at) + interval '24 hours';
ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_records_pkey;
ALTER TABLE idempotency_records DROP COLUMN key;
ALTER TABLE idempotency_records RENAME COLUMN scoped_key TO key;
ALTER TABLE idempotency_records ALTER COLUMN credential_id SET NOT NULL;
ALTER TABLE idempotency_records ALTER COLUMN key SET NOT NULL;
ALTER TABLE idempotency_records ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE idempotency_records ADD PRIMARY KEY (credential_id, key);
ALTER TABLE idempotency_records ADD CONSTRAINT idempotency_records_credential_id_service_credentials_id_fk
  FOREIGN KEY (credential_id) REFERENCES service_credentials(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS idx_idempotency_records_status_created;
CREATE INDEX idx_idempotency_records_status_expiry ON idempotency_records(status, expires_at);
--> statement-breakpoint
CREATE TABLE ledger_sync_state (
  ledger_id uuid PRIMARY KEY REFERENCES ledgers(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ledger_sync_state(ledger_id) SELECT id FROM ledgers;
CREATE TABLE ledger_change_batches (
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0),
  transaction_id bigint NOT NULL,
  categories_changed boolean NOT NULL DEFAULT false,
  settings_changed boolean NOT NULL DEFAULT false,
  counts_changed boolean NOT NULL DEFAULT false,
  stats_changed boolean NOT NULL DEFAULT false,
  reset_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_id, version),
  UNIQUE (ledger_id, transaction_id)
);
CREATE INDEX idx_ledger_change_batches_created ON ledger_change_batches(created_at);
CREATE TABLE ledger_change_items (
  ledger_id uuid NOT NULL,
  version bigint NOT NULL,
  source_document_id uuid NOT NULL,
  PRIMARY KEY (ledger_id, version, source_document_id),
  CONSTRAINT fk_ledger_change_items_batch FOREIGN KEY (ledger_id, version)
    REFERENCES ledger_change_batches(ledger_id, version) ON DELETE CASCADE
);
CREATE INDEX idx_ledger_change_items_document ON ledger_change_items(ledger_id, source_document_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION record_ledger_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_ledger_id uuid;
  target_document_id uuid;
  change_version bigint;
  change_kind text := TG_ARGV[0];
  new_row jsonb := coalesce(to_jsonb(NEW), '{}'::jsonb);
  old_row jsonb := coalesce(to_jsonb(OLD), '{}'::jsonb);
BEGIN
  target_ledger_id := CASE WHEN change_kind = 'settings'
    THEN coalesce(new_row->>'id', old_row->>'id')::uuid
    ELSE coalesce(new_row->>'ledger_id', old_row->>'ledger_id')::uuid
  END;
  -- Cascading child deletes run after the parent ledger is no longer visible.
  -- There is no client left to consume a delta for a deleted ledger.
  IF NOT EXISTS (SELECT 1 FROM ledgers WHERE id = target_ledger_id) THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF change_kind IN ('document', 'entry', 'revision') THEN
    target_document_id := CASE
      WHEN change_kind = 'document' THEN coalesce(new_row->>'id', old_row->>'id')::uuid
      ELSE coalesce(new_row->>'source_document_id', old_row->>'source_document_id')::uuid
    END;
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
    counts_changed = counts_changed OR change_kind IN ('document', 'entry'),
    stats_changed = stats_changed OR change_kind IN ('document', 'entry', 'category', 'settings'),
    reset_required = reset_required OR (
      change_kind = 'settings' AND old_row->>'main_currency' IS DISTINCT FROM new_row->>'main_currency'
    )
  WHERE ledger_id = target_ledger_id AND version = change_version;
  IF target_document_id IS NOT NULL THEN
    INSERT INTO ledger_change_items(ledger_id, version, source_document_id)
    VALUES (target_ledger_id, change_version, target_document_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER trg_source_documents_change_log AFTER INSERT OR UPDATE OR DELETE ON source_documents
FOR EACH ROW EXECUTE FUNCTION record_ledger_change('document');
CREATE TRIGGER trg_source_document_revisions_change_log AFTER INSERT OR UPDATE OR DELETE ON source_document_revisions
FOR EACH ROW EXECUTE FUNCTION record_ledger_change('revision');
CREATE TRIGGER trg_ledger_entries_change_log AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION record_ledger_change('entry');
CREATE TRIGGER trg_entry_categories_change_log AFTER INSERT OR UPDATE OR DELETE ON entry_categories
FOR EACH ROW EXECUTE FUNCTION record_ledger_change('category');
CREATE TRIGGER trg_ledgers_settings_change_log
AFTER UPDATE OF ai_language, preferred_currencies, main_currency, collapse_entries_default, ai_custom_prompt, time_zone ON ledgers
FOR EACH ROW EXECUTE FUNCTION record_ledger_change('settings');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prune_ledger_change_log(target_ledger_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE deleted_count integer;
BEGIN
  WITH retained_floor AS (
    SELECT greatest(coalesce(max(version), 0) - 10000, 0) AS version
    FROM ledger_change_batches WHERE ledger_id = target_ledger_id
  ), deleted AS (
    DELETE FROM ledger_change_batches batch USING retained_floor floor
    WHERE batch.ledger_id = target_ledger_id
      AND batch.version <= floor.version
      AND batch.created_at < now() - interval '30 days'
    RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END $$;
--> statement-breakpoint
ANALYZE ledger_sync_state;
ANALYZE ledger_change_batches;
ANALYZE ledger_change_items;
