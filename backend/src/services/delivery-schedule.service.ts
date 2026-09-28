import { db } from '../database';
import { auditLogs } from '../database/schema';
import { DeliveryScheduleRepository } from '../repositories/delivery-schedule.repository';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';

const repo = new DeliveryScheduleRepository();

export class DeliveryScheduleService {
  async reserve(data: {
    date: string;
    time: string;
    externalSellerId: string;
    customerName: string;
    city: string;
  }): Promise<string> {
    return repo.reserve(data);
  }

  async getBookedTimes(date: string): Promise<string[]> {
    return repo.getBookedTimes(date);
  }

  async getScheduleRange(from: string, to: string): Promise<any[]> {
    return repo.getScheduleRange(from, to);
  }

  async releaseSlot(id: string, userId: string): Promise<void> {
    const slot = await repo.findById(id);
    if (!slot) throw new AppError('Reserva não encontrada', 404);
    if (slot.status !== 'reserved') throw new AppError('Reserva já foi liberada', 400);

    await repo.release(id);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'RELEASE_DELIVERY_SLOT',
      entityType: 'DeliverySchedule',
      entityId: id,
      oldValue: { date: slot.date, time: slot.time, customerName: slot.customer_name, city: slot.city },
      newValue: { status: 'released' },
    });
  }
}
