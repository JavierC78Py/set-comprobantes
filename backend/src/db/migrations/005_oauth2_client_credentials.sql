-- =============================================================================
-- Migración 005: Soporte OAuth2 Client Credentials para ORDS
--
-- Agrega campos para client_id, client_secret y token_endpoint necesarios
-- para el flujo OAuth2 client_credentials de Oracle ORDS.
-- =============================================================================

-- Agregar nuevas columnas
ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS ords_client_id VARCHAR(500),
  ADD COLUMN IF NOT EXISTS ords_client_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ords_token_endpoint VARCHAR(500);

-- Actualizar el CHECK constraint para incluir CLIENT_CREDENTIALS
ALTER TABLE tenant_config DROP CONSTRAINT IF EXISTS tenant_config_ords_tipo_autenticacion_check;
ALTER TABLE tenant_config ADD CONSTRAINT tenant_config_ords_tipo_autenticacion_check
  CHECK (ords_tipo_autenticacion IN ('BASIC', 'BEARER', 'NONE', 'CLIENT_CREDENTIALS'));
