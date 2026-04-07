import { db } from '../database';
import { messages, customers } from '../database/schema';
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
    // Busca a última mensagem de cada telefone para montar a lista de conversas
    const result = await db.execute(sql`
      SELECT 
        m1.id,
        m1.meta_message_id as metaMessageId,
        m1.customer_id as customerId,
        m1.from_phone as fromPhone,
        m1.to_phone as toPhone,
        m1.type,
        m1.content,
        m1.direction,
        m1.status,
        m1.timestamp,
        m1.tag,
        m1.notes,
        m1.created_at as createdAt,
        m1.updated_at as updatedAt,
        m1.deleted_at as deletedAt,
        c.name as customerName,
        m1.content as lastMessage,
        m1.timestamp as lastMessageAt
      FROM messages m1
      LEFT JOIN customers c ON m1.customer_id = c.id
      INNER JOIN (
        SELECT 
          CASE WHEN direction = 'inbound' THEN from_phone ELSE to_phone END as contact_phone,
          MAX(timestamp) as max_ts
        FROM messages
        WHERE deleted_at IS NULL
        GROUP BY contact_phone
      ) m2 ON (CASE WHEN m1.direction = 'inbound' THEN m1.from_phone ELSE m1.to_phone END) = m2.contact_phone 
          AND m1.timestamp = m2.max_ts
      WHERE m1.deleted_at IS NULL
      ORDER BY m1.timestamp DESC
    `);
    
    return result;
  }

  async listChatHistory(phone: string, page: number, limit: number) {
    const offset = (page - 1) * limit;
    
    return db
      .select()
      .from(messages)
      .where(
        and(
          isNull(messages.deletedAt),
          or(eq(messages.fromPhone, phone), eq(messages.toPhone, phone))
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(messages.timestamp));
  }
}
