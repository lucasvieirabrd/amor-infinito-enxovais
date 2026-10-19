-- Permissão por vendedor externo para agendar entrega no mesmo dia (hoje).
-- Padrão 0 = todos os vendedores existentes continuam com a regra atual (amanhã no mínimo).
--
-- ATENÇÃO Railway: rodar os dois comandos abaixo SEPARADAMENTE no Railway Query.
-- Passo 1 — verificar se a coluna já existe (retorna 1 se sim, 0 se não):
--   SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_sellers'
--     AND COLUMN_NAME = 'can_schedule_same_day';
-- Passo 2 — executar APENAS SE o passo 1 retornou 0:
ALTER TABLE external_sellers
  ADD COLUMN can_schedule_same_day TINYINT(1) NOT NULL DEFAULT 0;
