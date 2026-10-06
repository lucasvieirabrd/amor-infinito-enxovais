-- Permissão por vendedor externo para agendar entrega no mesmo dia (hoje).
-- ADD COLUMN IF NOT EXISTS: idempotente no MySQL 8.0 (Railway).
-- Padrão 0 = todos os vendedores existentes continuam com a regra atual (amanhã no mínimo).
ALTER TABLE external_sellers
  ADD COLUMN IF NOT EXISTS can_schedule_same_day TINYINT(1) NOT NULL DEFAULT 0;
