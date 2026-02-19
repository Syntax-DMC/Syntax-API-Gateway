ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS request_body TEXT;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS response_headers JSONB;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS response_body TEXT;
