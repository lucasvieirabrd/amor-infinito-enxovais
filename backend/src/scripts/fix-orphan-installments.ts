/**
 * fix-orphan-installments.ts
 *
 * Corrige parcelas órfãs: vendas com deleted_at NOT NULL cujas parcelas
 * ainda estão ativas (deleted_at IS NULL).
 *
 * Uso:
 *   npx ts-node src/scripts/fix-orphan-installments.ts
 */

import { db } from '../database';
import { sql } from 'drizzle-orm';

async function fixOrphanInstallments() {
  console.log('Buscando parcelas órfãs de vendas canceladas...');

  // Contar antes
  const [beforeRows] = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM installments i
    INNER JOIN sales s ON i.sale_id = s.id
    WHERE s.deleted_at IS NOT NULL
      AND i.deleted_at IS NULL
  `);
  const total = Number((beforeRows as any[])[0]?.total ?? 0);
  console.log(`Parcelas órfãs encontradas: ${total}`);

  if (total === 0) {
    console.log('Nenhuma parcela órfã. Nada a fazer.');
    process.exit(0);
  }

  // Corrigir: setar deleted_at e status = 'canceled' em lote
  const result = await db.execute(sql`
    UPDATE installments i
    INNER JOIN sales s ON i.sale_id = s.id
    SET i.status = 'canceled',
        i.deleted_at = NOW()
    WHERE s.deleted_at IS NOT NULL
      AND i.deleted_at IS NULL
  `);

  const affected = (result[0] as any)?.affectedRows ?? 0;
  console.log(`Parcelas corrigidas: ${affected}`);
  console.log('Concluído.');
  process.exit(0);
}

fixOrphanInstallments().catch((err) => {
  console.error('Erro ao executar script:', err);
  process.exit(1);
});
