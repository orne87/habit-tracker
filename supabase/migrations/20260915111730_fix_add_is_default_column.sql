/*
# Fix: add is_default column to custom_habits + seed existing profiles

1. Schema change
- Add `is_default` boolean column (default false) to `custom_habits`.
  This column was referenced by the app code but missing from the table,
  causing all habit inserts (seed + custom) to fail silently.

2. Retroactive seed
- Profiles that were created without habits due to the bug get the 9 defaults.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_habits' AND column_name = 'is_default') THEN
    ALTER TABLE custom_habits ADD COLUMN is_default boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Mark existing legacy habits (profile_id = null) as defaults
UPDATE custom_habits SET is_default = true WHERE profile_id IS NULL;

-- For each profile that has zero habits, insert the 9 default habits
INSERT INTO custom_habits (label, icon, applies_to_all, weekdays, sort_order, is_default, profile_id)
SELECT
  h.label, h.icon, h.applies_to_all,
  CASE WHEN h.applies_to_all THEN NULL ELSE ARRAY[h.wd]::int2[] END,
  h.sort_order, true, p.id
FROM profiles p
CROSS JOIN (VALUES
  ('Subliminales', '🎧', true, NULL::int, 1),
  ('Afirmaciones', '✨', true, NULL::int, 2),
  ('Descarga Física', '👟', true, NULL::int, 3),
  ('Piano', '🎹', true, NULL::int, 4),
  ('Estudio', '📚', true, NULL::int, 5),
  ('Desconexión', '🧘', true, NULL::int, 6),
  ('Journaling', '✍️', true, NULL::int, 7),
  ('Miércoles sin redes', '📵', false, 3, 8),
  ('Viernes de mimo', '🛁', false, 5, 9)
) AS h(label, icon, applies_to_all, wd, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM custom_habits ch WHERE ch.profile_id = p.id
);
