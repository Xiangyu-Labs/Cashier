DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'ck_active_service_credentials_hashed'
			AND conrelid = 'service_credentials'::regclass
	) THEN
		ALTER TABLE "service_credentials" ADD CONSTRAINT "ck_active_service_credentials_hashed" CHECK ("service_credentials"."deleted_at" IS NOT NULL OR ("service_credentials"."token_hash" IS NOT NULL AND "service_credentials"."token_prefix" IS NOT NULL AND "service_credentials"."token_suffix" IS NOT NULL));
	END IF;
END $$;
