CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

DO $$
DECLARE
  mismatch_count bigint;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM source_documents sd
  LEFT JOIN source_document_revisions r
    ON r.source_document_id = sd.id AND r.ledger_id = sd.ledger_id
  GROUP BY sd.id
  HAVING count(r.id) = 0
  LIMIT 1;
  IF mismatch_count IS NOT NULL THEN
    RAISE EXCEPTION 'model convergence blocked: source document without revision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM source_documents sd
    JOIN source_document_revisions r
      ON r.source_document_id = sd.id AND r.id LIKE 'legacy-revision:%'
    WHERE sd.text IS DISTINCT FROM r.submitted_text
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: legacy submitted text mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM source_documents sd
    JOIN source_document_revisions r
      ON r.source_document_id = sd.id AND r.id LIKE 'legacy-revision:%'
    WHERE jsonb_array_length(coalesce(sd.image_urls, '[]'::jsonb)) <>
      (SELECT count(*) FROM revision_files rf WHERE rf.revision_id = r.id)
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: legacy file count mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM source_document_revisions r
    WHERE r.id LIKE 'legacy-revision:%'
      AND (SELECT count(*) FROM ledger_entries le WHERE le.source_document_revision_id = r.id) <>
          (SELECT count(*) FROM revision_entries re WHERE re.revision_id = r.id)
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: legacy entry count mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM source_documents sd
    LEFT JOIN source_document_revisions r
      ON r.id = sd.active_revision_id
     AND r.ledger_id = sd.ledger_id
     AND r.source_document_id = sd.id
    WHERE sd.active_revision_id IS NOT NULL AND r.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM source_documents sd
    LEFT JOIN source_document_revisions r
      ON r.id = sd.pending_revision_id
     AND r.ledger_id = sd.ledger_id
     AND r.source_document_id = sd.id
    WHERE sd.pending_revision_id IS NOT NULL AND r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: invalid revision pointer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ledger_entries le
    JOIN source_document_revisions r ON r.id = le.source_document_revision_id
    WHERE le.source_document_id IS DISTINCT FROM r.source_document_id
       OR le.ledger_id IS DISTINCT FROM r.ledger_id
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: ledger entry revision ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM source_documents
    WHERE entry_date IS NOT NULL AND NOT pg_input_is_valid(entry_date, 'date')
  ) OR EXISTS (
    SELECT 1 FROM currency_rates WHERE NOT pg_input_is_valid(date, 'date')
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: invalid calendar date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM otp_tokens
    WHERE ip_address IS NOT NULL AND NOT pg_input_is_valid(ip_address, 'inet')
  ) THEN
    RAISE EXCEPTION 'model convergence blocked: invalid IP address';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE ledger_entries ADD COLUMN position integer;
--> statement-breakpoint
UPDATE ledger_entries le
SET position = re.position
FROM revision_entries re
WHERE re.ledger_entry_id = le.id;
--> statement-breakpoint
UPDATE ledger_entries le
SET position = COALESCE((
  SELECT max(other.position) + 1
  FROM ledger_entries other
  WHERE other.source_document_revision_id = le.source_document_revision_id
    AND other.position IS NOT NULL
), 0)
WHERE le.position IS NULL;
--> statement-breakpoint
ALTER TABLE ledger_entries ALTER COLUMN position SET NOT NULL;
ALTER TABLE ledger_entries ALTER COLUMN position SET DEFAULT 0;
ALTER TABLE ledger_entries ADD CONSTRAINT ck_ledger_entries_position CHECK (position >= 0);
--> statement-breakpoint
CREATE TEMP TABLE revision_id_map(old_id text PRIMARY KEY, new_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO revision_id_map
SELECT id, CASE WHEN pg_input_is_valid(id, 'uuid') THEN id::uuid ELSE gen_random_uuid() END
FROM source_document_revisions;

CREATE TEMP TABLE stored_file_id_map(old_id text PRIMARY KEY, new_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO stored_file_id_map
SELECT id, CASE WHEN pg_input_is_valid(id, 'uuid') THEN id::uuid ELSE gen_random_uuid() END
FROM stored_files;

CREATE TEMP TABLE revision_file_id_map(old_id text PRIMARY KEY, new_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO revision_file_id_map
SELECT id, CASE WHEN pg_input_is_valid(id, 'uuid') THEN id::uuid ELSE gen_random_uuid() END
FROM revision_files;
--> statement-breakpoint
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = current_schema()::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE source_documents sd SET active_revision_id = m.new_id::text
FROM revision_id_map m WHERE sd.active_revision_id = m.old_id;
UPDATE source_documents sd SET pending_revision_id = m.new_id::text
FROM revision_id_map m WHERE sd.pending_revision_id = m.old_id;
UPDATE ledger_entries le SET source_document_revision_id = m.new_id::text
FROM revision_id_map m WHERE le.source_document_revision_id = m.old_id;
UPDATE revision_files rf SET revision_id = m.new_id::text
FROM revision_id_map m WHERE rf.revision_id = m.old_id;
UPDATE processing_attempts pa SET revision_id = m.new_id::text
FROM revision_id_map m WHERE pa.revision_id = m.old_id;
UPDATE processing_outbox po SET revision_id = m.new_id::text
FROM revision_id_map m WHERE po.revision_id = m.old_id;
UPDATE source_document_revisions r SET id = m.new_id::text
FROM revision_id_map m WHERE r.id = m.old_id;

UPDATE revision_files rf SET stored_file_id = m.new_id::text
FROM stored_file_id_map m WHERE rf.stored_file_id = m.old_id;
UPDATE upload_session_files uf SET stored_file_id = m.new_id::text
FROM stored_file_id_map m WHERE uf.stored_file_id = m.old_id;
UPDATE stored_files sf SET id = m.new_id::text
FROM stored_file_id_map m WHERE sf.id = m.old_id;

UPDATE revision_files rf SET id = m.new_id::text
FROM revision_file_id_map m WHERE rf.id = m.old_id;
--> statement-breakpoint
DROP TABLE revision_entries;
--> statement-breakpoint
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('users','id'),
    ('otp_tokens','id'),
    ('email_change_challenges','id'),('email_change_challenges','user_id'),
    ('ledgers','id'),('ledgers','user_id'),
    ('entry_categories','id'),('entry_categories','ledger_id'),
    ('ledger_entries','id'),('ledger_entries','ledger_id'),('ledger_entries','category_id'),
    ('ledger_entries','source_document_id'),('ledger_entries','source_document_revision_id'),
    ('service_credentials','id'),('service_credentials','ledger_id'),
    ('source_documents','id'),('source_documents','ledger_id'),
    ('source_documents','active_revision_id'),('source_documents','pending_revision_id'),
    ('source_document_revisions','id'),('source_document_revisions','ledger_id'),
    ('source_document_revisions','source_document_id'),
    ('stored_files','id'),('stored_files','ledger_id'),
    ('revision_files','id'),('revision_files','ledger_id'),('revision_files','revision_id'),
    ('revision_files','stored_file_id'),
    ('processing_attempts','id'),('processing_attempts','ledger_id'),('processing_attempts','revision_id'),
    ('processing_outbox','id'),('processing_outbox','ledger_id'),('processing_outbox','revision_id'),
    ('upload_sessions','id'),('upload_sessions','ledger_id'),
    ('upload_session_files','id'),('upload_session_files','ledger_id'),
    ('upload_session_files','upload_session_id'),('upload_session_files','stored_file_id'),
    ('upload_session_files','target_id')
  ) AS columns_to_convert(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = item.table_name
        AND c.column_name = item.column_name
        AND c.data_type = 'text'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING %I::uuid',
        item.table_name, item.column_name, item.column_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TYPE source_document_status AS ENUM (
  'processing','completed','candidate_pending','anomaly','failed','cancelled'
);
CREATE TYPE source_document_type AS ENUM ('ai_parsed','manual');
CREATE TYPE revision_outcome AS ENUM (
  'processing','completed','anomaly','failed','cancelled','abandoned'
);
CREATE TYPE processing_attempt_status AS ENUM (
  'queued','processing','completed','anomaly','failed','cancelled'
);
CREATE TYPE retry_classification AS ENUM ('retryable','permanent','anomaly');
CREATE TYPE processing_outbox_status AS ENUM ('pending','claimed','completed','failed','cancelled');
CREATE TYPE upload_session_status AS ENUM ('open','finalizing','finalized','expired','cancelled');
CREATE TYPE upload_transport AS ENUM ('proxy','direct');
CREATE TYPE upload_file_status AS ENUM ('planned','uploaded','finalized','rejected');
CREATE TYPE idempotency_status AS ENUM ('pending','completed');
--> statement-breakpoint
ALTER TABLE source_document_revisions DROP CONSTRAINT IF EXISTS ck_source_document_revisions_outcome;
ALTER TABLE processing_attempts DROP CONSTRAINT IF EXISTS ck_processing_attempts_status;
ALTER TABLE processing_attempts DROP CONSTRAINT IF EXISTS ck_processing_attempts_retry_classification;
ALTER TABLE processing_outbox DROP CONSTRAINT IF EXISTS ck_processing_outbox_status;
ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS ck_upload_sessions_status;
ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS ck_upload_sessions_transport;
ALTER TABLE upload_session_files DROP CONSTRAINT IF EXISTS ck_upload_session_files_status;
ALTER TABLE idempotency_records DROP CONSTRAINT IF EXISTS ck_idempotency_records_status;

ALTER TABLE source_documents ALTER COLUMN type DROP DEFAULT;
ALTER TABLE source_documents ALTER COLUMN type TYPE source_document_type USING type::source_document_type;
ALTER TABLE source_documents ALTER COLUMN type SET DEFAULT 'ai_parsed';
ALTER TABLE source_document_revisions ALTER COLUMN outcome DROP DEFAULT;
ALTER TABLE source_document_revisions ALTER COLUMN outcome TYPE revision_outcome USING outcome::revision_outcome;
ALTER TABLE source_document_revisions ALTER COLUMN outcome SET DEFAULT 'processing';
ALTER TABLE processing_attempts ALTER COLUMN status DROP DEFAULT;
ALTER TABLE processing_attempts ALTER COLUMN status TYPE processing_attempt_status USING status::processing_attempt_status;
ALTER TABLE processing_attempts ALTER COLUMN status SET DEFAULT 'queued';
ALTER TABLE processing_attempts ALTER COLUMN retry_classification TYPE retry_classification USING retry_classification::retry_classification;
ALTER TABLE processing_outbox ALTER COLUMN status DROP DEFAULT;
ALTER TABLE processing_outbox ALTER COLUMN status TYPE processing_outbox_status USING status::processing_outbox_status;
ALTER TABLE processing_outbox ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE upload_sessions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE upload_sessions ALTER COLUMN status TYPE upload_session_status USING status::upload_session_status;
ALTER TABLE upload_sessions ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE upload_sessions ALTER COLUMN transport DROP DEFAULT;
ALTER TABLE upload_sessions ALTER COLUMN transport TYPE upload_transport USING transport::upload_transport;
ALTER TABLE upload_sessions ALTER COLUMN transport SET DEFAULT 'proxy';
ALTER TABLE upload_session_files ALTER COLUMN status DROP DEFAULT;
ALTER TABLE upload_session_files ALTER COLUMN status TYPE upload_file_status USING status::upload_file_status;
ALTER TABLE upload_session_files ALTER COLUMN status SET DEFAULT 'planned';
ALTER TABLE idempotency_records ALTER COLUMN status DROP DEFAULT;
ALTER TABLE idempotency_records ALTER COLUMN status TYPE idempotency_status USING status::idempotency_status;
ALTER TABLE idempotency_records ALTER COLUMN status SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE source_documents ADD COLUMN current_status source_document_status;
UPDATE source_documents sd
SET current_status = CASE
  WHEN sd.pending_revision_id IS NOT NULL THEN (
    SELECT CASE
      WHEN r.outcome = 'completed' AND sd.active_revision_id IS NOT NULL THEN 'candidate_pending'::source_document_status
      WHEN r.outcome = 'abandoned' AND sd.active_revision_id IS NOT NULL THEN 'completed'::source_document_status
      WHEN r.outcome = 'abandoned' THEN 'cancelled'::source_document_status
      ELSE r.outcome::text::source_document_status
    END
    FROM source_document_revisions r WHERE r.id = sd.pending_revision_id
  )
  WHEN sd.active_revision_id IS NOT NULL THEN 'completed'::source_document_status
  ELSE 'processing'::source_document_status
END;
ALTER TABLE source_documents ALTER COLUMN current_status SET NOT NULL;
ALTER TABLE source_documents ALTER COLUMN current_status SET DEFAULT 'processing';
--> statement-breakpoint
ALTER TABLE source_documents ALTER COLUMN entry_date TYPE date USING entry_date::date;
ALTER TABLE currency_rates ALTER COLUMN date TYPE date USING date::date;
ALTER TABLE currency_rates ALTER COLUMN base TYPE varchar(3);
ALTER TABLE ledger_entries ALTER COLUMN currency TYPE varchar(3);
ALTER TABLE otp_tokens ALTER COLUMN ip_address TYPE inet USING ip_address::inet;
ALTER TABLE stored_files ALTER COLUMN byte_size TYPE bigint;
ALTER TABLE upload_session_files ALTER COLUMN expected_byte_size TYPE bigint;
ALTER TABLE source_documents ADD COLUMN effective_date date
  GENERATED ALWAYS AS (COALESCE(entry_date, (created_at AT TIME ZONE 'UTC')::date)) STORED;
ALTER TABLE source_documents ALTER COLUMN effective_date SET NOT NULL;
--> statement-breakpoint
ALTER TABLE source_documents DROP COLUMN text;
ALTER TABLE source_documents DROP COLUMN image_urls;
ALTER TABLE source_documents DROP COLUMN status;
ALTER TABLE source_documents DROP COLUMN anomaly_reason;
ALTER TABLE source_documents DROP COLUMN metadata;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE otp_tokens ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE email_change_challenges ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ledgers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE entry_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ledger_entries ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE service_credentials ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE source_documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE source_document_revisions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE stored_files ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE revision_files ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE processing_attempts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE processing_outbox ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE upload_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE upload_session_files ALTER COLUMN id SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE entry_categories ADD CONSTRAINT entry_categories_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE ledgers ADD CONSTRAINT ledgers_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE service_credentials ADD CONSTRAINT service_credentials_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE stored_files ADD CONSTRAINT stored_files_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE upload_sessions ADD CONSTRAINT upload_sessions_ledger_id_ledgers_id_fk
  FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE email_change_challenges ADD CONSTRAINT email_change_challenges_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE source_document_revisions ADD CONSTRAINT fk_revisions_source_document_ledger
  FOREIGN KEY (ledger_id, source_document_id)
  REFERENCES source_documents(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE revision_files ADD CONSTRAINT fk_revision_files_revision_ledger
  FOREIGN KEY (ledger_id, revision_id)
  REFERENCES source_document_revisions(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE revision_files ADD CONSTRAINT fk_revision_files_stored_file_ledger
  FOREIGN KEY (ledger_id, stored_file_id)
  REFERENCES stored_files(ledger_id, id);
ALTER TABLE processing_attempts ADD CONSTRAINT fk_processing_attempts_revision_ledger
  FOREIGN KEY (ledger_id, revision_id)
  REFERENCES source_document_revisions(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE processing_outbox ADD CONSTRAINT fk_processing_outbox_revision_ledger
  FOREIGN KEY (ledger_id, revision_id)
  REFERENCES source_document_revisions(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE upload_session_files ADD CONSTRAINT fk_upload_session_files_session_ledger
  FOREIGN KEY (ledger_id, upload_session_id)
  REFERENCES upload_sessions(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE upload_session_files ADD CONSTRAINT fk_upload_session_files_stored_file_ledger
  FOREIGN KEY (ledger_id, stored_file_id)
  REFERENCES stored_files(ledger_id, id);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_document_ledger
  FOREIGN KEY (ledger_id, source_document_id)
  REFERENCES source_documents(ledger_id, id) ON DELETE CASCADE;
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_revision_ledger
  FOREIGN KEY (ledger_id, source_document_revision_id)
  REFERENCES source_document_revisions(ledger_id, id) ON DELETE CASCADE;
CREATE UNIQUE INDEX uq_source_document_revisions_ledger_document_id
  ON source_document_revisions(ledger_id, source_document_id, id);
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_document_revision
  FOREIGN KEY (ledger_id, source_document_id, source_document_revision_id)
  REFERENCES source_document_revisions(ledger_id, source_document_id, id) ON DELETE CASCADE;
ALTER TABLE source_documents ADD CONSTRAINT fk_source_documents_active_revision
  FOREIGN KEY (ledger_id, id, active_revision_id)
  REFERENCES source_document_revisions(ledger_id, source_document_id, id)
  ON DELETE SET NULL (active_revision_id);
ALTER TABLE source_documents ADD CONSTRAINT fk_source_documents_pending_revision
  FOREIGN KEY (ledger_id, id, pending_revision_id)
  REFERENCES source_document_revisions(ledger_id, source_document_id, id)
  ON DELETE SET NULL (pending_revision_id);
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_category_id_entry_categories_id_fk
  FOREIGN KEY (category_id) REFERENCES entry_categories(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_source_document_status()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pending_outcome revision_outcome;
BEGIN
  IF NEW.pending_revision_id IS NOT NULL THEN
    SELECT outcome INTO pending_outcome
    FROM source_document_revisions WHERE id = NEW.pending_revision_id;
    NEW.current_status := CASE
      WHEN pending_outcome = 'completed' AND NEW.active_revision_id IS NOT NULL
        THEN 'candidate_pending'::source_document_status
      WHEN pending_outcome = 'abandoned' AND NEW.active_revision_id IS NOT NULL
        THEN 'completed'::source_document_status
      WHEN pending_outcome = 'abandoned'
        THEN 'cancelled'::source_document_status
      ELSE pending_outcome::text::source_document_status
    END;
  ELSIF NEW.active_revision_id IS NOT NULL THEN
    NEW.current_status := 'completed';
  ELSE
    NEW.current_status := 'processing';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_source_documents_refresh_status
BEFORE UPDATE ON source_documents
FOR EACH ROW EXECUTE FUNCTION refresh_source_document_status();

CREATE OR REPLACE FUNCTION touch_source_document_status_from_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE source_documents
  SET current_status = current_status
  WHERE id = NEW.source_document_id
    AND (active_revision_id = NEW.id OR pending_revision_id = NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_revisions_refresh_document_status
AFTER INSERT OR UPDATE ON source_document_revisions
FOR EACH ROW EXECUTE FUNCTION touch_source_document_status_from_revision();
--> statement-breakpoint
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_source_docs_ledger_status;
DROP INDEX IF EXISTS idx_source_docs_ledger_created;
DROP INDEX IF EXISTS idx_source_docs_ledger_entry_date;
DROP INDEX IF EXISTS idx_source_docs_ledger_status_date;
DROP INDEX IF EXISTS idx_source_docs_ledger_status_type;
DROP INDEX IF EXISTS idx_source_docs_ledger_active_revision;
DROP INDEX IF EXISTS idx_source_docs_ledger_pending_revision;
DROP INDEX IF EXISTS idx_ledger_entries_source_doc;
DROP INDEX IF EXISTS idx_ledger_entries_ledger_revision;
DROP INDEX IF EXISTS idx_ledger_entries_ledger_active_created;
DROP INDEX IF EXISTS idx_ledger_entries_ledger_category_active;
DROP INDEX IF EXISTS idx_ledger_entries_ledger_currency;
DROP INDEX IF EXISTS idx_processing_outbox_dispatch;
DROP INDEX IF EXISTS idx_processing_outbox_claim_expiry;

CREATE UNIQUE INDEX uq_entry_categories_ledger_id_id ON entry_categories(ledger_id, id);
CREATE UNIQUE INDEX uq_ledger_entries_revision_position
  ON ledger_entries(source_document_revision_id, position);
CREATE INDEX idx_source_documents_active_feed
  ON source_documents(ledger_id, effective_date DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_source_documents_active_status_feed
  ON source_documents(ledger_id, current_status, effective_date DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_source_documents_active_revision ON source_documents(active_revision_id);
CREATE INDEX idx_source_documents_pending_revision ON source_documents(pending_revision_id);
CREATE INDEX idx_ledger_entries_active_feed
  ON ledger_entries(ledger_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ledger_entries_active_category
  ON ledger_entries(ledger_id, category_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ledger_entries_active_currency
  ON ledger_entries(ledger_id, currency, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ledger_entries_active_amount
  ON ledger_entries(ledger_id, (COALESCE(converted_amount, amount))) WHERE deleted_at IS NULL;
CREATE INDEX idx_ledger_entries_search
  ON ledger_entries USING gin (lower(item_name || ' ' || COALESCE(description, '')) public.gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_processing_outbox_pending_dispatch
  ON processing_outbox(available_at, created_at) WHERE status = 'pending';
CREATE INDEX idx_processing_outbox_claim_expiry
  ON processing_outbox(claim_expires_at) WHERE status = 'claimed';
--> statement-breakpoint
ANALYZE source_documents;
ANALYZE source_document_revisions;
ANALYZE ledger_entries;
