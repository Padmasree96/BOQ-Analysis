-- ============================================================
-- FlyyyAI — Engineer Profiles Table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the engineer_profiles table
CREATE TABLE IF NOT EXISTS public.engineer_profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL DEFAULT '',
    company     TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    designation TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE public.engineer_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policy: users can read their own profile
CREATE POLICY "Users can view own profile"
    ON public.engineer_profiles
    FOR SELECT
    USING (auth.uid() = id);

-- 4. Policy: users can insert their own profile
CREATE POLICY "Users can insert own profile"
    ON public.engineer_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 5. Policy: users can update their own profile
CREATE POLICY "Users can update own profile"
    ON public.engineer_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 6. (Optional) Auto-create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.engineer_profiles (id, full_name, company)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'company', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
