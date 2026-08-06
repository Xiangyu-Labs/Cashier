-- Data-layer integrity: close the category tenant-isolation gap.
--
-- ledger_entries.category_id previously referenced entry_categories(id) only,
-- which allowed entries to reference categories owned by a different ledger.
-- Application checks catch that today, but the database must be the final
-- line of defence so every adapter (current or future) inherits the rule.
--
-- 1. Detach historical rows whose category belongs to another ledger.
-- 2. Drop the legacy single-column FK.
-- 3. Replace it with a ledger-scoped composite FK created NOT VALID and then
--    validated, so the initial lock window stays short.

UPDATE ledger_entries entry
SET category_id = NULL
WHERE entry.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM entry_categories category
    WHERE category.id = entry.category_id
      AND category.ledger_id = entry.ledger_id
  );

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_category_id_entry_categories_id_fk;

ALTER TABLE ledger_entries
  ADD CONSTRAINT fk_ledger_entries_category_ledger
  FOREIGN KEY (ledger_id, category_id)
  REFERENCES entry_categories(ledger_id, id)
  ON DELETE SET NULL (category_id)
  NOT VALID;

ALTER TABLE ledger_entries
  VALIDATE CONSTRAINT fk_ledger_entries_category_ledger;
