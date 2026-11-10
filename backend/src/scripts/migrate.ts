/**
 * Safe migration script — runs ALTER TABLE statements directly via mysql2.
 * Does NOT use drizzle-kit push (which can truncate enum columns).
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const migrations: { name: string; sql: string }[] = [
  {
    name: '0001_add_unsupported_message_type',
    sql: `ALTER TABLE messages MODIFY COLUMN type ENUM('text','template','image','audio','video','document','unknown','unsupported') NOT NULL DEFAULT 'text'`,
  },
  {
    name: '0002_create_conversations_table',
    sql: `CREATE TABLE IF NOT EXISTS conversations (
      phone VARCHAR(20) NOT NULL PRIMARY KEY,
      tag VARCHAR(50) NOT NULL DEFAULT 'none',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '0003a_normalize_messages_from_phone',
    sql: `UPDATE messages SET from_phone = CONCAT('55', from_phone) WHERE from_phone REGEXP '^[0-9]{11}$'`,
  },
  {
    name: '0003b_normalize_messages_to_phone',
    sql: `UPDATE messages SET to_phone = CONCAT('55', to_phone) WHERE to_phone REGEXP '^[0-9]{11}$'`,
  },
  {
    // Remove 11-digit entries that already have a 13-digit (55-prefixed) counterpart.
    // Handles partial state if a previous normalization attempt crashed mid-run.
    name: '0003c_dedup_conversations_phone',
    sql: `DELETE c1 FROM conversations c1
          INNER JOIN conversations c2
          WHERE c1.phone < c2.phone
            AND (CONCAT('55', c1.phone) = c2.phone OR c1.phone = CONCAT('55', c2.phone))`,
  },
  {
    name: '0003c2_normalize_conversations_phone',
    sql: `UPDATE conversations SET phone = CONCAT('55', phone) WHERE phone REGEXP '^[0-9]{11}$'`,
  },
  {
    name: '0003d_normalize_customers_phone',
    sql: `UPDATE customers SET phone = CONCAT('55', phone) WHERE phone REGEXP '^[0-9]{11}$'`,
  },
  {
    name: '0004_add_partial_installment_status',
    sql: `ALTER TABLE installments MODIFY COLUMN status ENUM('pending','paid','overdue','canceled','partial') NOT NULL DEFAULT 'pending'`,
  },
  {
    name: '0005_add_customer_address_number',
    sql: `ALTER TABLE customers ADD COLUMN address_number VARCHAR(20) NULL AFTER address_street`,
  },
  {
    name: '0006_seed_pix_settings',
    sql: `INSERT INTO settings (id, \`key\`, value, description)
      VALUES
        (UUID(), 'pix_celita',  '74480669604',                         'Chave PIX da Celita (CPF)'),
        (UUID(), 'pix_marcelo', '16981271021',                         'Chave PIX do Marcelo (telefone)'),
        (UUID(), 'pix_qrcode',  '5c17e289-963b-4f2b-af01-cd5c52f5af8e', 'Chave PIX aleatória para QR Code')
      ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
  },
  {
    name: '0007a_drop_trigger_no_duplicate_installments',
    sql: `DROP TRIGGER IF EXISTS trg_no_duplicate_installments`,
  },
  {
    // MySQL não suporta partial unique index (WHERE deleted_at IS NULL).
    // Solução: trigger BEFORE INSERT que rejeita inserção se já existe parcela ativa
    // com mesmo (sale_id, installment_number) e deleted_at IS NULL.
    name: '0007b_create_trigger_no_duplicate_installments',
    sql: `CREATE TRIGGER trg_no_duplicate_installments
      BEFORE INSERT ON installments
      FOR EACH ROW
      BEGIN
        DECLARE cnt INT DEFAULT 0;
        SELECT COUNT(*) INTO cnt
        FROM installments
        WHERE sale_id = NEW.sale_id
          AND installment_number = NEW.installment_number
          AND deleted_at IS NULL;
        IF cnt > 0 THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Duplicate active installment: same sale_id and installment_number already exists';
        END IF;
      END`,
  },
  {
    name: '0008_add_media_id_to_messages',
    sql: `ALTER TABLE messages ADD COLUMN media_id VARCHAR(255) NULL`,
  },
  {
    name: '0009_add_media_filename_to_messages',
    sql: `ALTER TABLE messages ADD COLUMN media_filename VARCHAR(500) NULL`,
  },
  {
    name: '0010_add_sticker_type_to_messages',
    sql: `ALTER TABLE messages MODIFY COLUMN type ENUM('text','template','image','audio','video','document','unknown','unsupported','sticker') NOT NULL DEFAULT 'text'`,
  },
  {
    name: '0011_create_pricing_history',
    sql: `CREATE TABLE IF NOT EXISTS pricing_history (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      supplier VARCHAR(255),
      nf_number VARCHAR(100),
      total_products DECIMAL(12,2),
      total_nf DECIMAL(12,2),
      freight DECIMAL(12,2) NOT NULL DEFAULT 0,
      factor DECIMAL(10,6),
      params_snapshot JSON NOT NULL,
      created_by VARCHAR(36),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '0012_create_pricing_history_items',
    sql: `CREATE TABLE IF NOT EXISTS pricing_history_items (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      history_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      unit_cost DECIMAL(12,2) NOT NULL,
      assembly DECIMAL(12,2) NOT NULL DEFAULT 0,
      installments_count INT NOT NULL DEFAULT 10,
      real_cost DECIMAL(12,2) NOT NULL,
      price_credit DECIMAL(12,2) NOT NULL,
      price_cash DECIMAL(12,2) NOT NULL,
      price_card_1x DECIMAL(12,2) NOT NULL,
      price_card_10x DECIMAL(12,2) NOT NULL,
      profit_credit DECIMAL(12,2),
      profit_cash DECIMAL(12,2),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '0013_seed_pricing_params',
    sql: `INSERT INTO settings (id, \`key\`, value, description)
      SELECT UUID(), 'pricing_params',
        '{"imposto":0.083,"comissao_vendedores_crediario":0.05,"comissao_marcelo_celita_crediario":0.05,"comissao_vendedores_avista":0.05,"comissao_marcelo_celita_avista":0.05,"custos_fixos":0.20,"calote":0.05,"multiplicador_crediario":3,"lucro_desejado_avista_cartao":0.20,"taxa_cartao_1x":0.03,"taxa_cartao_parcelado":0.10,"mostrar_lucro_para_marcelo":true}',
        'Parâmetros de precificação'
      FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM settings WHERE \`key\` = 'pricing_params')`,
  },
  {
    name: '0014_seed_pricing_access_code',
    sql: `INSERT INTO settings (id, \`key\`, value, description)
      SELECT UUID(), 'pricing_access_code', 'AIE-PRC-7X2K', 'Código de acesso à calculadora de precificação'
      FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM settings WHERE \`key\` = 'pricing_access_code')`,
  },
];

async function run() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);

  try {
    // Ensure migrations tracking table exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        ran_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of migrations) {
      const [rows] = await connection.execute(
        'SELECT name FROM _migrations WHERE name = ?',
        [migration.name]
      ) as any;

      if (rows.length > 0) {
        console.log(`[migrate] skip  ${migration.name} (already applied)`);
        continue;
      }

      console.log(`[migrate] apply ${migration.name} ...`);
      try {
        // Use query() instead of execute() — DDL statements (CREATE/DROP TRIGGER, etc.)
        // are not supported in the prepared statement protocol used by execute().
        await connection.query(migration.sql);
      } catch (err: any) {
        // errno 1060 = ER_DUP_FIELDNAME (column already exists) — safe to ignore
        if (err?.errno !== 1060) throw err;
        console.log(`[migrate] warn  ${migration.name} — column already exists, skipping ALTER`);
      }
      await connection.execute(
        'INSERT INTO _migrations (name) VALUES (?)',
        [migration.name]
      );
      console.log(`[migrate] done  ${migration.name}`);
    }

    console.log('[migrate] all migrations up to date');
  } finally {
    await connection.end();
  }
}

run().catch(err => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
