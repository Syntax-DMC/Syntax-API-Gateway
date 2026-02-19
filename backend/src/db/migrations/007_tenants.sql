-- 1. Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. Seed Platform + Default tenants
INSERT INTO tenants (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Platform', 'platform'),
    ('00000000-0000-0000-0000-000000000002', 'Default', 'default')
    ON CONFLICT DO NOTHING;

-- 3. Add is_superadmin to users, add tenant_id to child tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sap_connections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE api_catalog ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 4. User-Tenant junction table
CREATE TABLE IF NOT EXISTS user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- 5. Migrate existing data
--    Existing admins -> superadmin + Platform AND Default tenant membership
--    (admins need Default too because their existing data lives there)
UPDATE users SET is_superadmin = true WHERE role = 'admin';
INSERT INTO user_tenants (user_id, tenant_id, role)
    SELECT id, '00000000-0000-0000-0000-000000000001', 'admin'
    FROM users WHERE role = 'admin'
    ON CONFLICT DO NOTHING;
INSERT INTO user_tenants (user_id, tenant_id, role)
    SELECT id, '00000000-0000-0000-0000-000000000002', 'admin'
    FROM users WHERE role = 'admin'
    ON CONFLICT DO NOTHING;

--    Existing regular users -> Default tenant membership
INSERT INTO user_tenants (user_id, tenant_id, role)
    SELECT id, '00000000-0000-0000-0000-000000000002', 'user'
    FROM users WHERE role = 'user'
    ON CONFLICT DO NOTHING;

--    Backfill tenant_id on child tables (all existing data -> Default tenant)
UPDATE sap_connections SET tenant_id = '00000000-0000-0000-0000-000000000002'
    WHERE tenant_id IS NULL;
UPDATE api_tokens SET tenant_id = '00000000-0000-0000-0000-000000000002'
    WHERE tenant_id IS NULL;
UPDATE api_catalog SET tenant_id = '00000000-0000-0000-0000-000000000002'
    WHERE tenant_id IS NULL;

-- 6. Make tenant_id NOT NULL + add indexes
ALTER TABLE sap_connections ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_tokens ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_catalog ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sap_connections_tenant ON sap_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sap_connections_tenant_user ON sap_connections(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_catalog_tenant ON api_catalog(tenant_id);

-- 7. Drop old role column (replaced by is_superadmin + user_tenants.role)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP COLUMN IF EXISTS role;
