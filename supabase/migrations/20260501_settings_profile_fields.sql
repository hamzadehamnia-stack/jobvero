ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS target_countries text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS target_job_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS min_salary integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_salary integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS work_type text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS available_from date,
ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en',
ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
