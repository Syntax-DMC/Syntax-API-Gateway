-- Connection-API Assignments: which APIs are available on which connections
CREATE TABLE IF NOT EXISTS connection_api_assignments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sap_connection_id UUID NOT NULL REFERENCES sap_connections(id) ON DELETE CASCADE,
    api_definition_id UUID NOT NULL REFERENCES api_definitions(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(sap_connection_id, api_definition_id)
);
CREATE INDEX IF NOT EXISTS idx_conn_api_assign_connection ON connection_api_assignments(sap_connection_id);
CREATE INDEX IF NOT EXISTS idx_conn_api_assign_definition ON connection_api_assignments(api_definition_id);
CREATE INDEX IF NOT EXISTS idx_conn_api_assign_tenant ON connection_api_assignments(tenant_id);
