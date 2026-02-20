-- 012: Add response_fields column to api_definitions
-- Stores flattened response schema fields for auto-dependency resolution

ALTER TABLE api_definitions
  ADD COLUMN IF NOT EXISTS response_fields JSONB DEFAULT '[]'::jsonb;
