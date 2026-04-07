import { db } from '../database';
import { customers } from '../database/schema';
import { eq, and, isNull, or, like, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class CustomerRepository {
  async findByCpf(cpf: string) {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.cpf, cpf), isNull(customers.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByPhone(phone: string) {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.phone, phone), isNull(customers.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    
    let query = db
      .select()
      .from(customers)
      .where(isNull(customers.deletedAt));

    if (search) {
      query = db
        .select()
        .from(customers)
        .where(
          and(
            isNull(customers.deletedAt),
            or(
              like(customers.name, `%${search}%`),
              like(customers.cpf, `%${search}%`),
              like(customers.phone, `%${search}%`)
            )
          )
        );
    }

    const data = await query.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(
        search 
          ? and(
              isNull(customers.deletedAt),
              or(
                like(customers.name, `%${search}%`),
                like(customers.cpf, `%${search}%`),
                like(customers.phone, `%${search}%`)
              )
            )
          : isNull(customers.deletedAt)
      );

    return {
      data,
      total: countResult[0].count,
      page,
      limit,
    };
  }

  async create(data: any) {
    const id = uuidv4();
    await db.insert(customers).values({
      ...data,
      id,
    });
    return this.findById(id);
  }

  async update(id: string, data: any) {
    await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id));
    return this.findById(id);
  }

  async delete(id: string) {
    await db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, id));
  }
}
