-- FlyAI projects table compatibility fix
-- Run this in Supabase SQL Editor on the target project.

BEGIN;

-- Add columns expected by the current frontend.
ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS project_type TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS contact_person TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tender_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gi_file_path TEXT,
  ADD COLUMN IF NOT EXISTS boq_file_path TEXT,
  ADD COLUMN IF NOT EXISTS tender_file_path TEXT,
  ADD COLUMN IF NOT EXISTS spec_file_path TEXT,
  ADD COLUMN IF NOT EXISTS makes_file_path TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill from legacy column names when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.projects
      SET project_name = COALESCE(NULLIF(project_name, ''), NULLIF(name, ''))
      WHERE project_name IS NULL OR project_name = ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'client'
  ) THEN
    EXECUTE $sql$
      UPDATE public.projects
      SET client_name = COALESCE(NULLIF(client_name, ''), NULLIF(client, ''))
      WHERE client_name IS NULL OR client_name = ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'budget'
  ) THEN
    EXECUTE $sql$
      UPDATE public.projects
      SET estimated_value = COALESCE(estimated_value, budget)
      WHERE estimated_value IS NULL AND budget IS NOT NULL
    $sql$;
  END IF;
END
$$;

UPDATE public.projects
SET currency = COALESCE(NULLIF(currency, ''), 'INR')
WHERE currency IS NULL OR currency = '';

UPDATE public.projects
SET extraction_status = COALESCE(NULLIF(extraction_status, ''), 'pending')
WHERE extraction_status IS NULL OR extraction_status = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'created_at'
  ) THEN
    EXECUTE $sql$
      UPDATE public.projects
      SET updated_at = COALESCE(updated_at, created_at, NOW())
      WHERE updated_at IS NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.projects
      SET updated_at = NOW()
      WHERE updated_at IS NULL
    $sql$;
  END IF;
END
$$;

-- Keep updated_at current on row updates.
CREATE OR REPLACE FUNCTION public.projects_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_set_updated_at_trigger ON public.projects;

CREATE TRIGGER projects_set_updated_at_trigger
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.projects_set_updated_at();

-- Helpful query performance indexes.
CREATE INDEX IF NOT EXISTS idx_projects_user_id_created_at
  ON public.projects (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON public.projects (status);

COMMIT;
