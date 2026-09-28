/**
 * Teste de concorrência: dois vendedores tentando reservar o mesmo (date,time) em paralelo.
 * Prova que exatamente 1 sucede e o outro recebe 409 (garantia física via active_slot UNIQUE).
 *
 * Uso: npx tsx src/scripts/test-ds-concurrency.ts
 * Requer: tabela delivery_schedule no banco (rodar 0008_add_delivery_schedule.sql antes)
 */
import { db } from '../database';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/AppError';

const TEST_DATE = '2099-12-31'; // data futura que não conflita com dados reais
const TEST_TIME = '10:00';
const FAKE_SELLER = '00000000-0000-0000-0000-000000000099';

type ReserveResult =
  | { ok: true;  id: string }
  | { ok: false; status: number; message: string };

async function reserveSlot(label: string): Promise<ReserveResult> {
  const id = uuidv4();
  try {
    await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id FROM delivery_schedule
        WHERE \`date\` = ${TEST_DATE}
          AND \`time\` = ${TEST_TIME}
          AND status = 'reserved'
          AND deleted_at IS NULL
        FOR UPDATE
      `);
      const existing = (rows as any)[0] as any[];
      if (existing.length > 0) {
        const err: any = new Error('SLOT_TAKEN');
        err.isSlotTaken = true;
        throw err;
      }
      await tx.execute(sql`
        INSERT INTO delivery_schedule
          (id, \`date\`, \`time\`, external_seller_id, customer_name, city, status, created_at, updated_at)
        VALUES
          (${id}, ${TEST_DATE}, ${TEST_TIME}, ${FAKE_SELLER},
           ${`Cliente ${label}`}, 'Jaboticabal', 'reserved', NOW(), NOW())
      `);
    });
    return { ok: true, id };
  } catch (err: any) {
    if (err.isSlotTaken || err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return { ok: false, status: 409, message: 'Esse horário acabou de ser reservado por outro vendedor, escolha outro' };
    }
    throw err;
  }
}

async function ensureTable() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS delivery_schedule (
      id                 VARCHAR(36)                  NOT NULL,
      \`date\`           DATE                         NOT NULL,
      \`time\`           VARCHAR(5)                   NOT NULL,
      external_seller_id VARCHAR(36)                  NOT NULL,
      customer_name      VARCHAR(255)                 NOT NULL,
      city               VARCHAR(100)                 NOT NULL,
      status             ENUM('reserved','released')  NOT NULL DEFAULT 'reserved',
      created_at         DATETIME                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME                     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at         DATETIME                     NULL,
      active_slot        VARCHAR(16) GENERATED ALWAYS AS (
        CASE WHEN status = 'reserved' AND deleted_at IS NULL
             THEN CONCAT(\`date\`, 'T', \`time\`)
             ELSE NULL
        END
      ) STORED,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ds_active_slot (active_slot),
      INDEX idx_ds_date_time (\`date\`, \`time\`),
      INDEX idx_ds_status    (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `));
}

async function cleanup() {
  await db.execute(sql`
    DELETE FROM delivery_schedule
    WHERE \`date\` = ${TEST_DATE} AND \`time\` = ${TEST_TIME}
  `);
}

async function main() {
  console.log('=== Teste de Concorrência: Reserva de Horário ===\n');
  console.log(`Slot de teste: ${TEST_DATE} ${TEST_TIME}`);

  await ensureTable();
  console.log('Tabela verificada/criada.');

  await cleanup();
  console.log('Dados anteriores do slot de teste limpos.\n');

  console.log('Disparando 2 reservas simultâneas (Promise.allSettled)...');
  const [r1, r2] = await Promise.allSettled([
    reserveSlot('A'),
    reserveSlot('B'),
  ]);

  const results: ReserveResult[] = [];
  const unexpectedErrors: unknown[] = [];

  for (const r of [r1, r2]) {
    if (r.status === 'fulfilled') results.push(r.value);
    else unexpectedErrors.push(r.reason);
  }

  console.log('\n--- Resultados ---');
  for (const [i, r] of results.entries()) {
    if (r.ok) {
      console.log(`  Reserva ${i + 1}: SUCESSO  id=${r.id}`);
    } else {
      const fail = r as { ok: false; status: number; message: string };
      console.log(`  Reserva ${i + 1}: REJEITADA  HTTP ${fail.status} -- "${fail.message}"`);
    }
  }
  if (unexpectedErrors.length > 0) {
    console.log(`\n  ${unexpectedErrors.length} erro(s) inesperado(s):`);
    unexpectedErrors.forEach(e => console.log(`    ${(e as any).message}`));
  }

  const successes = results.filter(r => r.ok);
  const failures  = results.filter(r => !r.ok) as { ok: false; status: number; message: string }[];
  const is409     = failures.every(r => r.status === 409);
  const passed    = successes.length === 1 && failures.length === 1 && is409 && unexpectedErrors.length === 0;

  console.log('\n--- Verificacao ---');
  console.log(`  Sucessos: ${successes.length}  (esperado: 1)`);
  console.log(`  Falhas:   ${failures.length}  (esperado: 1)`);
  console.log(`  Status da falha: ${failures[0]?.status ?? 'N/A'}  (esperado: 409)`);

  console.log(`\n${passed ? '✅ PASSOU' : '❌ FALHOU'}: ${passed
    ? 'exatamente 1 sucesso e 1 falha 409 — garantia de unicidade confirmada'
    : 'resultado inesperado — verificar logs acima'}`);

  await cleanup();
  process.exit(passed ? 0 : 1);
}

main().catch(e => {
  console.error('\nErro fatal:', e.message ?? e);
  process.exit(1);
});
