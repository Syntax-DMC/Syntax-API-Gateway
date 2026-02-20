-- API Registry: shared, tenant-scoped API definitions for orchestration
CREATE TABLE IF NOT EXISTS api_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug            VARCHAR(150) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    version         VARCHAR(50) NOT NULL DEFAULT '1.0',
    spec_format     VARCHAR(20) DEFAULT 'manual'
                    CHECK (spec_format IN ('openapi3','swagger2','manual')),
    method          VARCHAR(10) NOT NULL DEFAULT 'GET'
                    CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
    path            VARCHAR(500) NOT NULL,
    query_params    JSONB DEFAULT '[]'::jsonb,
    request_headers JSONB DEFAULT '[]'::jsonb,
    request_body    JSONB,
    response_schema JSONB,
    provides        TEXT[] DEFAULT '{}',
    depends_on      JSONB DEFAULT '[]'::jsonb,
    tags            TEXT[] DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_api_definitions_tenant ON api_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_definitions_tags ON api_definitions USING GIN(tags);

CREATE TABLE IF NOT EXISTS api_definition_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_definition_id UUID NOT NULL REFERENCES api_definitions(id) ON DELETE CASCADE,
    version_number    INTEGER NOT NULL,
    snapshot          JSONB NOT NULL,
    change_summary    VARCHAR(500),
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(api_definition_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_api_def_versions_def ON api_definition_versions(api_definition_id);
