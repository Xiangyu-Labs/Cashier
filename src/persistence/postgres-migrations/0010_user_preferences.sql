ALTER TABLE "users" ADD COLUMN "preferences" jsonb DEFAULT '{"interfaceLanguage":"auto"}'::jsonb NOT NULL;
