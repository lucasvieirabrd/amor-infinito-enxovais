ALTER TABLE messages
  MODIFY COLUMN tag ENUM('cobrança', 'lead', 'suporte', 'none', 'pago') NOT NULL DEFAULT 'none';
