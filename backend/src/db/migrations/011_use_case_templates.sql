-- Use-Case Templates: higher-level abstractions that group multiple API calls
CREATE TABLE IF NOT EXISTS use_case_templates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug             VARCHAR(150) NOT NULL,
    name             VARCHAR(200) NOT NULL,
    description      TEXT,
    required_context JSONB NOT NULL DEFAULT '[]'::jsonb,
    calls            JSONB NOT NULL DEFAULT '[]'::jsonb,
    mode             VARCHAR(15) NOT NULL DEFAULT 'parallel'
                     CHECK (mode IN ('parallel', 'sequential')),
    tags             TEXT[] DEFAULT '{}',
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_use_case_templates_tenant ON use_case_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_use_case_templates_tags ON use_case_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_use_case_templates_active ON use_case_templates(tenant_id, is_active);
