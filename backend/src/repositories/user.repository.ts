import { db } from '../database';
import { users } from '../database/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class UserRepository {
  async findByEmail(email: string) {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return result[0];
  }

  async create(data: any) {
    const id = uuidv4();
    await db.insert(users).values({
      ...data,
      id,
    });
    return this.findById(id);
  }

  async findByResetToken(token: string) {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.resetToken, token), isNull(users.deletedAt)))
      .limit(1);
    return result[0];
  }

  async update(id: string, data: any) {
    await db.update(users).set(data).where(eq(users.id, id));
    return this.findById(id);
  }
}
