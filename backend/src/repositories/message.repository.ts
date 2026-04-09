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
   * Lista as últimas conversas agrupadas por número de telefone.
   */
  async listConversations() {
    const result = await db.execute(sql`
      SELECT
        m1.id,
        m1.from_phone   AS fromPhone,
        m1.to_phone     AS toPhone,
        m1.direction,
        m1.status,
        m1.tag,
        m1.notes,
        COALESCE(c.name, c2.name) AS customerName,
        m1.content      AS lastMessage,
        m1.timestamp    AS lastMessageAt,
        m2.contact_phone AS contactPhone,
        COALESCE(conv.tag, 'none') AS conversationTag
      FROM messages m1
      LEFT JOIN customers c ON m1.customer_id = c.id
      INNER JOIN (
        SELECT
          CASE WHEN direction = 'inbound' THEN from_phone ELSE to_phone END AS contact_phone,
          MAX(timestamp) AS max_ts
        FROM messages
        WHERE deleted_at IS NULL
        GROUP BY contact_phone
      ) m2
        ON  (CASE WHEN m1.direction = 'inbound' THEN m1.from_phone ELSE m1.to_phone END) = m2.contact_phone
        AND m1.timestamp = m2.max_ts
      LEFT JOIN customers c2
        ON  c.id IS NULL
        AND (
          c2.phone = m2.contact_phone
          OR c2.phone = IF(LEFT(m2.contact_phone,2)='55', SUBSTR(m2.contact_phone,3), CONCAT('55',m2.contact_phone))
        )
      LEFT JOIN conversations conv ON conv.phone = m2.contact_phone
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
