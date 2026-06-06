-- Add follow_up_reminder and interview_reminder notification type support
-- (no schema change needed — type column is plain text)

-- Add a delete policy if missing (some older migrations may not have it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'notifications_delete'
  ) THEN
    CREATE POLICY "notifications_delete" ON notifications
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Seed 3 example notifications for every existing user who has none yet.
-- Safe to run multiple times (checks before inserting).
INSERT INTO notifications (user_id, type, title, message, read, created_at)
SELECT
  u.id,
  seed.type,
  seed.title,
  seed.message,
  seed.read,
  now() - seed.offset_interval
FROM auth.users u
CROSS JOIN (
  VALUES
    (
      'job_match',
      'New AI Job Match Found',
      'We found 3 new job listings that closely match your profile and preferences. Check them out in the AI Matches section — two are remote-friendly roles at companies you''ve shown interest in.',
      false,
      INTERVAL '15 minutes'
    ),
    (
      'interview_reminder',
      'Interview Tomorrow at 10:00 AM',
      'You have a scheduled interview coming up tomorrow. Make sure to review the company profile, prepare your answers for common questions, and check your video/audio setup. Good luck!',
      false,
      INTERVAL '2 hours'
    ),
    (
      'credits_low',
      'AI Credits Running Low',
      'You have fewer than 3 AI credits remaining. Once they run out, you won''t be able to generate cover letters or use the AI assistant. Upgrade your plan to get unlimited credits and keep your job search momentum going.',
      true,
      INTERVAL '1 day'
    )
) AS seed(type, title, message, read, offset_interval)
WHERE NOT EXISTS (
  SELECT 1 FROM notifications n WHERE n.user_id = u.id
);
