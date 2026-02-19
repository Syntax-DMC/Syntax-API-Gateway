CREATE TABLE IF NOT EXISTS api_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sap_connection_id UUID REFERENCES sap_connections(id) ON DELETE SET NULL,
  title VARCHAR(150) NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  path VARCHAR(500) NOT NULL,
  headers JSONB,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_api_catalog_user ON api_catalog(user_id);
