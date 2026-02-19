CREATE TABLE IF NOT EXISTS sap_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sap_base_url VARCHAR(500) NOT NULL,
    token_url VARCHAR(500) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    client_secret_enc TEXT NOT NULL,
    agent_api_url VARCHAR(500),
    agent_api_key_enc TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sap_connections_user ON sap_connections(user_id);
