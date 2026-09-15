/*
# Add password protection to profiles

1. Schema change
- Add `password_hash` text column to `profiles` (nullable for backward compat,
  but new profiles must set it).

2. No RLS policy changes needed — the app enforces password checks client-side
   and only shows profiles that were opened on the current device (stored in
   localStorage). The full profile list is no longer fetched from the DB.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'password_hash') THEN
    ALTER TABLE profiles ADD COLUMN password_hash text;
  END IF;
END $$;
