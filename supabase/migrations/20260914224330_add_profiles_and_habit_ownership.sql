/*
# Multi-user support: profiles + habit ownership

1. New Tables
- `profiles`: One row per person using the habit tracker.
  - `id` (uuid, primary key)
  - `name` (text, not null) - display name
  - `created_at` (timestamptz)

2. Modified Tables
- `habit_months`: Added `profile_id` column (nullable for backward compat).
  Unique constraint changed from (month) to (profile_id, month).
- `habit_checks`: Added `profile_id` column (nullable for backward compat).
- `custom_habits`: Added `profile_id` column. Renamed concept to "habits" (all habits are now per-profile).
  Removed `is_custom` distinction — all habits live in this table now.

3. Seed Data
- For backward compatibility, existing data keeps profile_id = NULL (shared/legacy).
- New data will always have a profile_id.

4. Security
- Single-tenant app with profile-based separation (no auth/login).
- All policies allow anon + authenticated CRUD.
- The app enforces profile separation in the frontend by filtering on profile_id.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_profiles" ON profiles;
CREATE POLICY "anon_select_profiles" ON profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_profiles" ON profiles;
CREATE POLICY "anon_insert_profiles" ON profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_profiles" ON profiles;
CREATE POLICY "anon_update_profiles" ON profiles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_profiles" ON profiles;
CREATE POLICY "anon_delete_profiles" ON profiles FOR DELETE
  TO anon, authenticated USING (true);

-- Add profile_id to existing tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_months' AND column_name = 'profile_id') THEN
    ALTER TABLE habit_months ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_checks' AND column_name = 'profile_id') THEN
    ALTER TABLE habit_checks ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_habits' AND column_name = 'profile_id') THEN
    ALTER TABLE custom_habits ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update unique constraint on habit_months to include profile_id
-- First drop the old unique constraint on (month) if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_months_month_key') THEN
    ALTER TABLE habit_months DROP CONSTRAINT habit_months_month_key;
  END IF;
END $$;

-- Add new unique constraint (profile_id, month) — but only if not already there
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_months_profile_month_key') THEN
    ALTER TABLE habit_months ADD CONSTRAINT habit_months_profile_month_key UNIQUE (profile_id, month);
  END IF;
END $$;

-- Update the unique constraint on habit_checks to include profile_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_checks_month_id_day_habit_key_key') THEN
    ALTER TABLE habit_checks DROP CONSTRAINT habit_checks_month_id_day_habit_key_key;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_checks_profile_month_day_habit_key') THEN
    ALTER TABLE habit_checks ADD CONSTRAINT habit_checks_profile_month_day_habit_key UNIQUE (month_id, day, habit_key, profile_id);
  END IF;
END $$;
