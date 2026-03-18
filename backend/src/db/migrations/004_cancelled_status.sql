-- Migration: Add CANCELLED status to jobs
-- Date: 2026-03-18

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_estado_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_estado_check
  CHECK (estado IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'));
