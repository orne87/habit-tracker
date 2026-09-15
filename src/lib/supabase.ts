import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  name: string;
  created_at: string;
};

export type HabitCheck = {
  id: string;
  month_id: string;
  day: number;
  habit_key: string;
  checked: boolean;
  profile_id: string | null;
};

export type HabitMonth = {
  id: string;
  month: string;
  profile_id: string | null;
};
