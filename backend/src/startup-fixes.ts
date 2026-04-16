import { db } from './database';
import { sql } from 'drizzle-orm';

/**
 * Corrige parcelas órfãs: vendas com deleted_at NOT NULL cujas parcelas
 * ainda estão ativas (deleted_at IS NULL).
 *
 * Idempotente — se já não há órfãs, retorna imediatamente.
 * Chamada automaticamente no startup do servidor.
 */
export async function fixOrphanInstallmentsOnStartup(): Promise<void> {
  try {
    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM installments i
      INNER JOIN sales s ON i.sale_id = s.id
      WHERE s.deleted_at IS NOT NULL
        AND i.deleted_at IS NULL
    `);

    const total = Number((countRows as any[])[0]?.total ?? 0);

    if (total === 0) {
      console.log('[startup] fix-orphan-installments: nenhuma parcela órfã encontrada.');
      return;
    }

    console.log(`[startup] fix-orphan-installments: corrigindo ${total} parcela(s) órfã(s)...`);

    const result = await db.execute(sql`
      UPDATE installments i
      INNER JOIN sales s ON i.sale_id = s.id
      SET i.status = 'canceled',
          i.deleted_at = NOW()
      WHERE s.deleted_at IS NOT NULL
        AND i.deleted_at IS NULL
    `);

    const affected = (result[0] as any)?.affectedRows ?? 0;
    console.log(`[startup] fix-orphan-installments: ${affected} parcela(s) corrigida(s).`);
  } catch (err) {
    // Nunca deixar falha aqui derrubar o servidor
    console.error('[startup] fix-orphan-installments: erro (não crítico):', err);
  }
}
