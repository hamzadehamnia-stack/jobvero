ALTER TABLE public.auto_apply_settings
  ALTER COLUMN ats_threshold SET DEFAULT 70;

UPDATE public.auto_apply_settings
  SET ats_threshold = 70 WHERE ats_threshold = 60;
