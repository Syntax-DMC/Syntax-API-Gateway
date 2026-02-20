-- Export audit log
CREATE TABLE IF NOT EXISTS export_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    sap_connection_id UUID NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    format          VARCHAR(20) NOT NULL CHECK (format IN ('openapi3_json', 'openapi3_yaml', 'swagger2_json', 'toolkit_config')),
    scope           VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'assigned')),
    api_count       INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_tenant ON export_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_connection ON export_logs(sap_connection_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_created ON export_logs(created_at DESC);
