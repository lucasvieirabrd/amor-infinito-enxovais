-- Substitui o booleano in_legal_process por um status de 3 valores por cliente.
-- Valores: 'normal' | 'legal_process' | 'agreement'
--
-- ATENÇÃO Railway: rodar os 3 comandos SEPARADAMENTE no Railway Query, nessa ordem.
-- NÃO rodar Comando 3 antes de confirmar que o deploy está estável.

-- COMANDO 1 — adicionar coluna (rodar UMA vez; falhará se rodar duas vezes)
ALTER TABLE customers
  ADD COLUMN customer_status VARCHAR(20) NOT NULL DEFAULT 'normal';

-- COMANDO 2 — migrar dados: in_legal_process=1 → 'legal_process'
UPDATE customers
  SET customer_status = 'legal_process'
  WHERE in_legal_process = 1;

-- COMANDO 3 — (OPCIONAL, após confirmar estabilidade) remover coluna antiga
-- ALTER TABLE customers DROP COLUMN in_legal_process;
