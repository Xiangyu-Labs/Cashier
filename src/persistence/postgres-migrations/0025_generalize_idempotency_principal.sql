ALTER TABLE idempotency_records
  DROP CONSTRAINT IF EXISTS idempotency_records_credential_id_service_credentials_id_fk;

ALTER TABLE idempotency_records DROP CONSTRAINT idempotency_records_pkey;
ALTER TABLE idempotency_records RENAME COLUMN credential_id TO principal_id;
ALTER TABLE idempotency_records ADD COLUMN principal_type text;
UPDATE idempotency_records SET principal_type = 'credential';
ALTER TABLE idempotency_records ALTER COLUMN principal_type SET NOT NULL;
ALTER TABLE idempotency_records
  ADD CONSTRAINT ck_idempotency_records_principal_type
  CHECK (principal_type IN ('credential', 'user'));
ALTER TABLE idempotency_records
  ADD PRIMARY KEY (principal_type, principal_id, key);
