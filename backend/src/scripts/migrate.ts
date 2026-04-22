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
      await connection.execute(migration.sql);
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
