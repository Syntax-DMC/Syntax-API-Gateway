CREATE TABLE IF NOT EXISTS request_logs (
    id BIGSERIAL PRIMARY KEY,
    api_token_id UUID REFERENCES api_tokens(id) ON DELETE SET NULL,
    sap_connection_id UUID REFERENCES sap_connections(id) ON DELETE SET NULL,

    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    target VARCHAR(10) NOT NULL CHECK (target IN ('agent', 'sap_dm')),
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    request_headers JSONB,
    request_body_size INTEGER,

    status_code INTEGER,
    response_body_size INTEGER,
    duration_ms INTEGER,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_token ON request_logs(api_token_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_connection ON request_logs(sap_connection_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_target ON request_logs(target);
