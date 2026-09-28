-- PARTE 1: Tabela de agendamento de entregas para formulário externo
-- Execute este comando isolado no console do Railway
CREATE TABLE IF NOT EXISTS delivery_schedule (
  id                 VARCHAR(36)                  NOT NULL,
  `date`             DATE                         NOT NULL,
  `time`             VARCHAR(5)                   NOT NULL,
  external_seller_id VARCHAR(36)                  NOT NULL,
  customer_name      VARCHAR(255)                 NOT NULL,
  city               VARCHAR(100)                 NOT NULL,
  status             ENUM('reserved','released')  NOT NULL DEFAULT 'reserved',
  created_at         DATETIME                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME                     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME                     NULL,
  -- Coluna gerada: só tem valor quando a reserva está ATIVA
  -- Múltiplos NULL são permitidos em UNIQUE MySQL → slots liberados/deletados não conflitam
  -- Um segundo INSERT no mesmo (date,time) ativo FALHA com ER_DUP_ENTRY (garantia física)
  active_slot        VARCHAR(16) GENERATED ALWAYS AS (
    CASE WHEN status = 'reserved' AND deleted_at IS NULL
         THEN CONCAT(`date`, 'T', `time`)
         ELSE NULL
    END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ds_active_slot (active_slot),
  INDEX idx_ds_date_time (`date`, `time`),
  INDEX idx_ds_status    (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
