import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env — auth will not work.'
  );
}

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnon || 'placeholder',
);
