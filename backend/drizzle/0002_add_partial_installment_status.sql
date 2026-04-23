ALTER TABLE installments
  MODIFY COLUMN status ENUM('pending', 'paid', 'overdue', 'canceled', 'partial') NOT NULL DEFAULT 'pending';
