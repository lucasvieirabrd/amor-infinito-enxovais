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
