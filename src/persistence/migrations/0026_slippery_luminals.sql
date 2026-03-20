-- Meta baseline sync migration.
-- The schema changes covered here were already applied by 0020-0025.
-- This no-op migration exists to align Drizzle snapshot metadata so that
-- future `drizzle-kit generate` runs diff against the current schema state.
SELECT 1;
