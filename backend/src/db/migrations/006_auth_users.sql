-- =============================================================================
-- Migración 006: Sistema de autenticación - usuarios y roles
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    nombre          VARCHAR(255) NOT NULL,
    rol             VARCHAR(20) NOT NULL DEFAULT 'USER'
                    CHECK (rol IN ('ADMIN', 'USER')),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS user_tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- Trigger updated_at para users
DROP TRIGGER IF EXISTS trg_update_users ON users;
CREATE TRIGGER trg_update_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Usuario admin por defecto (password: admin123)
-- Hash bcrypt generado con cost 10
INSERT INTO users (username, password_hash, nombre, rol)
VALUES ('admin', '$2b$10$3PPjxOZ6Pn7J1HNk7LnLD.EjII2MNrsNTnjyCkMTe3JA4FVt6oRFC', 'Administrador', 'ADMIN')
ON CONFLICT (username) DO NOTHING;
