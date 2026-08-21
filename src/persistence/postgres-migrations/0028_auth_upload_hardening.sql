-- Converge authentication uniqueness without silently selecting an arbitrary
-- challenge. The newest OTP per normalized email remains authoritative.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY email
           ORDER BY created_at DESC, id DESC
         ) AS position
  FROM otp_tokens
)
DELETE FROM otp_tokens token
USING ranked
WHERE token.id = ranked.id
  AND ranked.position > 1;

-- Legacy unkeyed OTP hashes have all exceeded the five-minute validity window
-- by the time this migration is deployed and must not remain verifiable.
DELETE FROM otp_tokens
WHERE token_hash !~ '^v2:[0-9a-f]{64}:[0-9a-f]{32}$';

DROP INDEX IF EXISTS idx_otp_tokens_email;
CREATE UNIQUE INDEX uniq_otp_tokens_email ON otp_tokens USING btree (email);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
CREATE UNIQUE INDEX uniq_users_active_email
  ON users USING btree (email)
  WHERE deleted_at IS NULL;
