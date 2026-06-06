-- Add folder/state columns + direction tracking to message_threads

ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS starred                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS archived               BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS deleted                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE message_threads ADD COLUMN IF NOT EXISTS last_message_direction text    NOT NULL DEFAULT 'outbound';
