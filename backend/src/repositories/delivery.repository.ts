import { db } from '../database';
import { deliveries } from '../database/schema';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface DeliveryRow {
  id: string;
  status: 'pending' | 'delivered';
  deliveryType: 'com_montagem' | 'sem_montagem' | null;
  deliveredAt: Date | null;
  createdAt: Date;
  customerId: string;
  customerName: string;
  customerPhone: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  saleNumber: string;
  saleDate: Date;
  items: Array<{ quantity: number; productName: string; productDescription: string | null }>;
}

const SELECT_COLS = sql`
  d.id,
  d.status,
  d.delivery_type        AS deliveryType,
  d.delivered_at         AS deliveredAt,
  d.created_at           AS createdAt,
  c.id                   AS customerId,
  c.name                 AS customerName,
  c.phone                AS customerPhone,
  c.address_street       AS addressStreet,
  c.address_number       AS addressNumber,
  c.address_neighborhood AS addressNeighborhood,
  c.address_city         AS addressCity,
  s.sale_number          AS saleNumber,
  s.sale_date            AS saleDate,
  GROUP_CONCAT(CONCAT(si.quantity, '|||', p.name, '|||', COALESCE(p.description, '')) ORDER BY p.name SEPARATOR '~~') AS itemsRaw
`;

const BASE_JOINS = sql`
  JOIN customers c  ON c.id  = d.customer_id
  JOIN sales s      ON s.id  = d.sale_id AND s.deleted_at IS NULL
  JOIN sale_items si ON si.sale_id = s.id
  JOIN products p   ON p.id  = si.product_id AND p.deleted_at IS NULL
`;

const GROUP_BY = sql`
  GROUP BY d.id, d.status, d.delivery_type, d.delivered_at, d.created_at,
           c.id, c.name, c.phone, c.address_street, c.address_number,
           c.address_neighborhood, c.address_city, s.sale_number, s.sale_date
`;

function parseRow(r: any): DeliveryRow {
  return {
    id: r.id,
    status: r.status,
    deliveryType: r.deliveryType ?? null,
    deliveredAt: r.deliveredAt ?? null,
    createdAt: r.createdAt,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    addressStreet: r.addressStreet ?? null,
    addressNumber: r.addressNumber ?? null,
    addressNeighborhood: r.addressNeighborhood ?? null,
    addressCity: r.addressCity ?? null,
    saleNumber: r.saleNumber,
    saleDate: r.saleDate,
    items: r.itemsRaw
      ? String(r.itemsRaw).split('~~').map((part: string) => {
          const [qtyStr, name, desc] = part.split('|||');
          return {
            quantity: Number(qtyStr),
            productName: name ?? '',
            productDescription: desc || null,
          };
        })
      : [],
  };
}

export class DeliveryRepository {
  async create(data: { saleId: string; customerId: string }): Promise<string> {
    const id = uuidv4();
    await db.insert(deliveries).values({ id, saleId: data.saleId, customerId: data.customerId });
    return id;
  }

  async findById(id: string): Promise<DeliveryRow | null> {
    const [rows] = await db.execute(sql`
      SELECT ${SELECT_COLS}
      FROM deliveries d
      ${BASE_JOINS}
      WHERE d.deleted_at IS NULL AND d.id = ${id}
      ${GROUP_BY}
    `) as any;

    if (!(rows as any[]).length) return null;
    return parseRow((rows as any[])[0]);
  }

  async list(params: { status: 'pending' | 'delivered'; search?: string; page: number; limit: number }) {
    const { status, search, page, limit } = params;
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const [rows] = await db.execute(sql`
      SELECT ${SELECT_COLS}
      FROM deliveries d
      ${BASE_JOINS}
      WHERE d.deleted_at IS NULL
        AND d.status = ${status}
        ${searchParam ? sql`AND c.name LIKE ${searchParam}` : sql``}
      ${GROUP_BY}
      ORDER BY d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as any;

    const [countRows] = await db.execute(sql`
      SELECT COUNT(DISTINCT d.id) AS total
      FROM deliveries d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.deleted_at IS NULL
        AND d.status = ${status}
        ${searchParam ? sql`AND c.name LIKE ${searchParam}` : sql``}
    `) as any;

    const total = Number((countRows as any[])[0]?.total ?? 0);
    const data = (rows as any[]).map(parseRow);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async deliver(id: string, data: { deliveryType: 'com_montagem' | 'sem_montagem'; deliveredBy: string }) {
    await db
      .update(deliveries)
      .set({
        status: 'delivered',
        deliveryType: data.deliveryType,
        deliveredAt: new Date(),
        deliveredBy: data.deliveredBy,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, id));
  }
}
