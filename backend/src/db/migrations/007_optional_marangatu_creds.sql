-- Migration 007: Make Marangatu credentials optional in tenant_config
-- Allows creating a tenant without credentials (admin creates, user fills later)

ALTER TABLE tenant_config
  ALTER COLUMN usuario_marangatu DROP NOT NULL,
  ALTER COLUMN clave_marangatu_encrypted DROP NOT NULL;
