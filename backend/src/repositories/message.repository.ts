import { db } from '../database';
import { messages, customers, conversations } from '../database/schema';
import { eq, and, isNull, sql, desc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class MessageRepository {
  async create(data: any) {
    const id = uuidv4();
    await db.insert(messages).values({
      ...data,
      id,
    });
    return id;
  }

  async findByMetaId(metaMessageId: string) {
    const result = await db
      .select()
      .from(messages)
      .where(and(eq(messages.metaMessageId, metaMessageId), isNull(messages.deletedAt)))
      .limit(1);
    return result[0];
  }

  async updateStatus(metaMessageId: string, status: any) {
    await db
      .update(messages)
      .set({ status, updatedAt: new Date() })
      .where(eq(messages.metaMessageId, metaMessageId));
  }

  async updateTagAndNotes(id: string, tag: any, notes?: string) {
    await db
      .update(messages)
      .set({ tag, notes, updatedAt: new Date() })
      .where(eq(messages.id, id));
  }

  /**
   * Lista as últimas conversas agrupadas por número de telefone normalizado.
   * Normalização: remove prefixo '55' de números com 13 dígitos (DDI brasileiro).
   */
  async listConversations() {
    const result = await db.execute(sql`
      SELECT
        m1.id,
        m1.from_phone                AS fromPhone,
        m1.to_phone                  AS toPhone,
        m1.direction,
        m1.status,
        m1.tag,
        m1.notes,
        COALESCE(c.name, c2.name)    AS customerName,
        m1.content                   AS lastMessage,
        m1.timestamp                 AS lastMessageAt,
        m2.contact_phone             AS contactPhone,
        COALESCE(conv.tag, 'none')   AS conversationTag
      FROM messages m1
      LEFT JOIN customers c ON m1.customer_id = c.id
      INNER JOIN (
        SELECT
          CASE
            WHEN direction = 'inbound' THEN
              CASE WHEN LENGTH(from_phone) = 13 AND from_phone LIKE '55%'
                   THEN SUBSTRING(from_phone, 3)
                   ELSE from_phone END
            ELSE
              CASE WHEN LENGTH(to_phone) = 13 AND to_phone LIKE '55%'
                   THEN SUBSTRING(to_phone, 3)
                   ELSE to_phone END
          END AS contact_phone,
          MAX(timestamp) AS max_ts
        FROM messages
        WHERE deleted_at IS NULL
        GROUP BY contact_phone
      ) m2
        ON  CASE
              WHEN m1.direction = 'inbound' THEN
                CASE WHEN LENGTH(m1.from_phone) = 13 AND m1.from_phone LIKE '55%'
                     THEN SUBSTRING(m1.from_phone, 3)
                     ELSE m1.from_phone END
              ELSE
                CASE WHEN LENGTH(m1.to_phone) = 13 AND m1.to_phone LIKE '55%'
                     THEN SUBSTRING(m1.to_phone, 3)
                     ELSE m1.to_phone END
            END = m2.contact_phone
        AND m1.timestamp = m2.max_ts
      LEFT JOIN customers c2
        ON  c.id IS NULL
        AND (
          c2.phone = m2.contact_phone
          OR c2.phone = CONCAT('55', m2.contact_phone)
        )
      LEFT JOIN conversations conv
        ON  CASE WHEN LENGTH(conv.phone) = 13 AND conv.phone LIKE '55%'
                 THEN SUBSTRING(conv.phone, 3)
                 ELSE conv.phone END = m2.contact_phone
      WHERE m1.deleted_at IS NULL
      ORDER BY m1.timestamp DESC
    `);

    // db.execute returns [rows, fields] tuple with mysql2 — extract rows only
    return (result as any)[0] ?? result;
  }

  async upsertConversationTag(phone: string, tag: string) {
    await db.execute(sql`
      INSERT INTO conversations (phone, tag) VALUES (${phone}, ${tag})
      ON DUPLICATE KEY UPDATE tag = ${tag}, updated_at = CURRENT_TIMESTAMP
    `);
  }

  async deleteConversationMessages(phone: string) {
    const digits = phone.replace(/\D/g, '');
    const alt = digits.startsWith('55') ? digits.slice(2) : `55${digits}`;
    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(
        and(
          isNull(messages.deletedAt),
          or(
            eq(messages.fromPhone, digits),
            eq(messages.fromPhone, alt),
            eq(messages.toPhone, digits),
            eq(messages.toPhone, alt)
          )
        )
      );
    // Also remove conversation tag record
    await db.execute(sql`DELETE FROM conversations WHERE phone = ${digits} OR phone = ${alt}`);
  }

  async getStatsToday() {
    // "today" in America/Sao_Paulo = UTC-3; compute start/end in UTC
    const todayResult = await db.execute(sql`
      SELECT
        SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS outboundToday,
        SUM(CASE WHEN direction='inbound'  THEN 1 ELSE 0 END) AS inboundToday
      FROM messages
      WHERE deleted_at IS NULL
        AND timestamp >= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
        AND timestamp <  DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) + INTERVAL 1 DAY
    `);

    const tagResult = await db.execute(sql`
      SELECT COALESCE(conv.tag, 'none') AS tag, COUNT(*) AS cnt
      FROM messages m
      LEFT JOIN conversations conv
        ON conv.phone = CASE WHEN m.direction='inbound' THEN m.from_phone ELSE m.to_phone END
      WHERE m.deleted_at IS NULL
        AND m.direction = 'inbound'
        AND m.timestamp >= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
        AND m.timestamp <  DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) + INTERVAL 1 DAY
      GROUP BY conv.tag
    `);

    const totals = ((todayResult as any)[0]?.[0]) ?? { outboundToday: 0, inboundToday: 0 };
    const tagRows: any[] = (tagResult as any)[0] ?? [];
    const inboundByTag: Record<string, number> = {};
    for (const row of tagRows) inboundByTag[row.tag ?? 'none'] = Number(row.cnt);

    return {
      outboundToday: Number(totals.outboundToday ?? 0),
      inboundToday:  Number(totals.inboundToday  ?? 0),
      inboundByTag,
    };
  }

  async listChatHistory(phone: string, page: number, limit: number) {
    const offset = (page - 1) * limit;

    // Build phone variants to handle stored numbers with/without 55 prefix
    const digits = phone.replace(/\D/g, '');
    const variants = new Set([digits]);
    if (digits.startsWith('55')) variants.add(digits.slice(2));
    else variants.add(`55${digits}`);
    const phoneList = [...variants];

    return db
      .select()
      .from(messages)
      .where(
        and(
          isNull(messages.deletedAt),
          or(
            ...phoneList.map(p => eq(messages.fromPhone, p)),
            ...phoneList.map(p => eq(messages.toPhone, p))
          )
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(messages.timestamp));
  }
}
