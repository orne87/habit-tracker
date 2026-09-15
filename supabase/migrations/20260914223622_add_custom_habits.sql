/*
# Custom habits support

1. New Tables
- `custom_habits`: User-created habits that appear alongside the 7 default ones.
  - `id` (uuid, primary key)
  - `label` (text, not null) - display name of the habit
  - `icon` (text, not null) - emoji icon
  - `applies_to_all` (boolean, default true) - true = every day, false = specific weekdays only
  - `weekdays` (int2[], nullable) - array of weekday numbers (0=Sunday..6=Saturday) when applies_to_all is false
  - `sort_order` (int, default 0) - ordering after default habits
  - `created_at` (timestamptz)

2. Seed Data
- "Miércoles sin redes" (applies to Wednesdays only, weekday=3)
- "Viernes de mimo" (applies to Fridays only, weekday=5)

3. Security
- Single-tenant app (no auth). Enable RLS on custom_habits.
- Allow anon + authenticated full CRUD (data is intentionally shared/public).
*/

CREATE TABLE IF NOT EXISTS custom_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  icon text NOT NULL DEFAULT '⭐',
  applies_to_all boolean NOT NULL DEFAULT true,
  weekdays int2[] DEFAULT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE custom_habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_custom_habits" ON custom_habits;
CREATE POLICY "anon_select_custom_habits" ON custom_habits FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_custom_habits" ON custom_habits;
CREATE POLICY "anon_insert_custom_habits" ON custom_habits FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_custom_habits" ON custom_habits;
CREATE POLICY "anon_update_custom_habits" ON custom_habits FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_custom_habits" ON custom_habits;
CREATE POLICY "anon_delete_custom_habits" ON custom_habits FOR DELETE
  TO anon, authenticated USING (true);

-- Seed special habits (idempotent: only insert if they don't already exist)
INSERT INTO custom_habits (label, icon, applies_to_all, weekdays, sort_order)
SELECT 'Miércoles sin redes', '📵', false, ARRAY[3]::int2[], 1
WHERE NOT EXISTS (SELECT 1 FROM custom_habits WHERE label = 'Miércoles sin redes');

INSERT INTO custom_habits (label, icon, applies_to_all, weekdays, sort_order)
SELECT 'Viernes de mimo', '🛁', false, ARRAY[5]::int2[], 2
WHERE NOT EXISTS (SELECT 1 FROM custom_habits WHERE label = 'Viernes de mimo');
