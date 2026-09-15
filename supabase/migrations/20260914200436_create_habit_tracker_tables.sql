/*
# Habit Tracker - "Mi 1% Diario"

1. New Tables
- `habit_months`: One row per month of habit tracking.
  - `id` (uuid, primary key)
  - `month` (text, not null) - format: "2026-09" (YYYY-MM)
  - `created_at` (timestamptz)
- `habit_checks`: One row per habit checked on a given day.
  - `id` (uuid, primary key)
  - `month_id` (uuid, foreign key to habit_months, ON DELETE CASCADE)
  - `day` (int, 1-31, not null)
  - `habit_key` (text, not null) - which habit column (subliminales, afirmaciones, etc.)
  - `checked` (boolean, default true)
  - `created_at` (timestamptz)
- Unique constraint on (month_id, day, habit_key) to prevent duplicates.
2. Security
- Single-tenant app (no auth). Enable RLS on both tables.
- Allow anon + authenticated full CRUD because data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS habit_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habit_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id uuid NOT NULL REFERENCES habit_months(id) ON DELETE CASCADE,
  day int NOT NULL CHECK (day >= 1 AND day <= 31),
  habit_key text NOT NULL,
  checked boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (month_id, day, habit_key)
);

ALTER TABLE habit_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_habit_months" ON habit_months;
CREATE POLICY "anon_select_habit_months" ON habit_months FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_habit_months" ON habit_months;
CREATE POLICY "anon_insert_habit_months" ON habit_months FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_habit_months" ON habit_months;
CREATE POLICY "anon_update_habit_months" ON habit_months FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_habit_months" ON habit_months;
CREATE POLICY "anon_delete_habit_months" ON habit_months FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_habit_checks" ON habit_checks;
CREATE POLICY "anon_select_habit_checks" ON habit_checks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_habit_checks" ON habit_checks;
CREATE POLICY "anon_insert_habit_checks" ON habit_checks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_habit_checks" ON habit_checks;
CREATE POLICY "anon_update_habit_checks" ON habit_checks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_habit_checks" ON habit_checks;
CREATE POLICY "anon_delete_habit_checks" ON habit_checks FOR DELETE
  TO anon, authenticated USING (true);
