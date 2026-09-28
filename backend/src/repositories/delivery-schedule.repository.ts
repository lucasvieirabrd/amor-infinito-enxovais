import { db } from '../database';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/AppError';

export class DeliveryScheduleRepository {
  /**
   * Reserva um slot em transação com SELECT FOR UPDATE + INSERT.
   * Defesa em camadas:
   *   1. SELECT FOR UPDATE → gap lock no índice idx_ds_date_time
   *   2. Coluna gerada active_slot + UNIQUE KEY → ER_DUP_ENTRY como rede de segurança física
   */
  async reserve(data: {
    date: string;
    time: string;
    externalSellerId: string;
    customerName: string;
    city: string;
  }): Promise<string> {
    const id = uuidv4();

    try {
      await db.transaction(async (tx) => {
        const rows = await tx.execute(sql`
          SELECT id FROM delivery_schedule
          WHERE \`date\` = ${data.date}
            AND \`time\` = ${data.time}
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
            (${id}, ${data.date}, ${data.time}, ${data.externalSellerId},
             ${data.customerName}, ${data.city}, 'reserved', NOW(), NOW())
        `);
      });
    } catch (err: any) {
      if (err.isSlotTaken || err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw new AppError(
          'Esse horário acabou de ser reservado por outro vendedor, escolha outro',
          409,
        );
      }
      throw err;
    }

    return id;
  }

  async getBookedTimes(date: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT \`time\`
      FROM delivery_schedule
      WHERE \`date\` = ${date}
        AND status = 'reserved'
        AND deleted_at IS NULL
      ORDER BY \`time\` ASC
    `);
    return ((rows as any)[0] as any[]).map((r: any) => String(r.time));
  }

  async getScheduleRange(from: string, to: string): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT
        ds.id,
        DATE_FORMAT(ds.date, '%Y-%m-%d') AS date,
        ds.time,
        es.name  AS seller_name,
        es.code  AS seller_code,
        ds.customer_name,
        ds.city,
        CONVERT_TZ(ds.created_at, '+00:00', '-03:00') AS created_at
      FROM delivery_schedule ds
      LEFT JOIN external_sellers es ON es.id = ds.external_seller_id
      WHERE ds.date >= ${from}
        AND ds.date <= ${to}
        AND ds.status = 'reserved'
        AND ds.deleted_at IS NULL
      ORDER BY ds.date ASC, ds.time ASC
    `);
    return (rows as any)[0] as any[];
  }

  async findById(id: string): Promise<any> {
    const rows = await db.execute(sql`
      SELECT id, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS date, \`time\`,
             external_seller_id, customer_name, city, status
      FROM delivery_schedule
      WHERE id = ${id} AND deleted_at IS NULL
    `);
    const data = (rows as any)[0] as any[];
    return data[0] || null;
  }

  async release(id: string): Promise<void> {
    await db.execute(sql`
      UPDATE delivery_schedule
      SET status = 'released', updated_at = NOW()
      WHERE id = ${id}
        AND status = 'reserved'
        AND deleted_at IS NULL
    `);
  }
}
