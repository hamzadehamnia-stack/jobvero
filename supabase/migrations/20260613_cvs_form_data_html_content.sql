-- Add form_data and html_content columns to cvs table
-- form_data: structured JSON of the CV builder form (replaces the legacy content column)
-- html_content: rendered HTML string of the CV preview (for auto-apply tailoring)

ALTER TABLE public.cvs
  ADD COLUMN IF NOT EXISTS form_data    jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS html_content text  DEFAULT NULL;

-- Backfill form_data from the existing content column for all rows
UPDATE public.cvs
  SET form_data = content
  WHERE form_data IS NULL AND content IS NOT NULL AND content != '{}';
