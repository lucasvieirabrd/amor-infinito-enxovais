-- ============================================================
-- PARTE 1: Criar tabela holidays
-- (rodar primeiro no Railway Query)
-- ============================================================

CREATE TABLE IF NOT EXISTS holidays (
  id          VARCHAR(36)  NOT NULL,
  date        DATE         NOT NULL,
  description VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_holidays_date UNIQUE (date)
) COLLATE utf8mb4_0900_ai_ci;

-- ============================================================
-- PARTE 2: Seed de feriados 2026 e 2027
-- (rodar separadamente; INSERT IGNORE é seguro para re-execução)
-- ============================================================

INSERT IGNORE INTO holidays (id, date, description) VALUES
  (UUID(), '2026-01-01', 'Confraternização Universal'),
  (UUID(), '2026-02-16', 'Carnaval (segunda-feira)'),
  (UUID(), '2026-02-17', 'Carnaval (terça-feira)'),
  (UUID(), '2026-04-03', 'Sexta-Feira Santa'),
  (UUID(), '2026-04-21', 'Tiradentes'),
  (UUID(), '2026-05-01', 'Dia do Trabalho'),
  (UUID(), '2026-06-04', 'Corpus Christi'),
  (UUID(), '2026-07-09', 'Revolução Constitucionalista'),
  (UUID(), '2026-09-07', 'Independência do Brasil'),
  (UUID(), '2026-10-12', 'Nossa Senhora Aparecida'),
  (UUID(), '2026-11-02', 'Finados'),
  (UUID(), '2026-11-15', 'Proclamação da República'),
  (UUID(), '2026-11-20', 'Consciência Negra'),
  (UUID(), '2026-12-25', 'Natal'),
  (UUID(), '2027-01-01', 'Confraternização Universal'),
  (UUID(), '2027-02-08', 'Carnaval (segunda-feira)'),
  (UUID(), '2027-02-09', 'Carnaval (terça-feira)'),
  (UUID(), '2027-03-26', 'Sexta-Feira Santa'),
  (UUID(), '2027-04-21', 'Tiradentes'),
  (UUID(), '2027-05-01', 'Dia do Trabalho'),
  (UUID(), '2027-05-27', 'Corpus Christi'),
  (UUID(), '2027-07-09', 'Revolução Constitucionalista'),
  (UUID(), '2027-09-07', 'Independência do Brasil'),
  (UUID(), '2027-10-12', 'Nossa Senhora Aparecida'),
  (UUID(), '2027-11-02', 'Finados'),
  (UUID(), '2027-11-15', 'Proclamação da República'),
  (UUID(), '2027-11-20', 'Consciência Negra'),
  (UUID(), '2027-12-25', 'Natal');
