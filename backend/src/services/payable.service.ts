import { PayableRepository } from '../repositories/payable.repository';
import { AppError } from '../utils/AppError';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { getDaysInMonth } from 'date-fns';

const payableRepository = new PayableRepository();
const whatsAppService = new WhatsAppService();

const CELITA_PHONE = '5516997977302';

const CATEGORY_LABELS: Record<string, string> = {
  fixas: 'Fixas',
  fornecedores: 'Fornecedores',
  salarios: 'Salários',
  impostos: 'Impostos',
  outras: 'Outras',
};

export class PayableService {
  async listPayables(month: number, year: number, search?: string, category?: string) {
    return payableRepository.findAllPayables(month, year, search, category);
  }

  async getSummary(month: number, year: number) {
    return payableRepository.getSummary(month, year);
  }

  async createPayable(data: {
    recurrenceId?: string;
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number;
    dueDate: string;
    notes?: string;
    createdBy?: string;
  }) {
    return payableRepository.createPayable({
      ...data,
      dueDate: new Date(data.dueDate + 'T12:00:00'),
    });
  }

  async updatePayable(id: string, data: {
    description?: string;
    category?: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number | null;
    dueDate?: string;
    notes?: string | null;
  }) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);
    if (existing.status === 'paid') throw new AppError('Não é possível editar uma conta já paga', 400);

    return payableRepository.updatePayable(id, {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate + 'T12:00:00') : undefined,
    });
  }

  async markAsPaid(id: string, paidAmount: number, paidAt?: string) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);
    if (existing.status === 'paid') throw new AppError('Conta já está paga', 400);

    const date = paidAt ? new Date(paidAt + 'T12:00:00') : new Date();
    return payableRepository.markAsPaid(id, paidAmount, date);
  }

  async revertPayment(id: string) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);
    if (existing.status !== 'paid') throw new AppError('Conta não está paga', 400);

    return payableRepository.revertPayment(id);
  }

  async deletePayable(id: string) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);
    await payableRepository.softDeletePayable(id);
  }

  // ─── Recurrences ─────────────────────────────────────────────────────────────

  async listRecurrences(includeInactive = false) {
    return payableRepository.findAllRecurrences(includeInactive);
  }

  async createRecurrence(data: {
    description: string;
    category: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number;
    isVariable: boolean;
    dueDay: number;
    notes?: string;
  }) {
    if (data.dueDay < 1 || data.dueDay > 31) throw new AppError('Dia de vencimento inválido (1–31)', 400);
    return payableRepository.createRecurrence(data);
  }

  async updateRecurrence(id: string, data: {
    description?: string;
    category?: 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
    amount?: number | null;
    isVariable?: boolean;
    dueDay?: number;
    active?: boolean;
    notes?: string | null;
  }) {
    const existing = await payableRepository.findRecurrenceById(id);
    if (!existing) throw new AppError('Recorrência não encontrada', 404);
    if (data.dueDay !== undefined && (data.dueDay < 1 || data.dueDay > 31)) {
      throw new AppError('Dia de vencimento inválido (1–31)', 400);
    }
    return payableRepository.updateRecurrence(id, data);
  }

  async deleteRecurrence(id: string) {
    const existing = await payableRepository.findRecurrenceById(id);
    if (!existing) throw new AppError('Recorrência não encontrada', 404);
    await payableRepository.softDeleteRecurrence(id);
  }

  // ─── Cron: generate payables on day 1 ────────────────────────────────────────

  async generateMonthlyPayables() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const daysInMonth = getDaysInMonth(now);

    const recurrences = await payableRepository.findAllRecurrences(false);
    let created = 0;

    for (const rec of recurrences) {
      const alreadyExists = await payableRepository.existsPayableForRecurrenceInMonth(rec.id, month, year);
      if (alreadyExists) continue;

      const day = Math.min(rec.dueDay, daysInMonth);
      const dueDate = new Date(year, month - 1, day, 12, 0, 0);

      await payableRepository.createPayable({
        recurrenceId: rec.id,
        description: rec.description,
        category: rec.category as any,
        amount: rec.isVariable ? undefined : (rec.amount != null ? parseFloat(String(rec.amount)) : undefined),
        dueDate,
      });
      created++;
    }

    console.log(`[PayableService] generateMonthlyPayables: ${created} conta(s) gerada(s) para ${month}/${year}.`);
    return { created };
  }

  // ─── Cron: daily alert to Celita ─────────────────────────────────────────────

  async sendPayablesAlert() {
    const pending = await payableRepository.findPendingOrSoonPayables();
    if (pending.length === 0) return;

    const overdue = pending.filter(p => p.urgency === 'overdue');
    const soon = pending.filter(p => p.urgency === 'soon');

    const fmt = (p: { description: string; amount: number | null; dueDate: any }) => {
      const dateStr = new Date(p.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const amtStr = p.amount != null
        ? `R$ ${p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '⚠️ valor variável';
      return `• ${p.description} — ${amtStr} (venc. ${dateStr})`;
    };

    const parts: string[] = ['📋 *Contas a Pagar — Alerta Diário*'];

    if (overdue.length > 0) {
      parts.push(`\n🔴 *Vencidas (${overdue.length}):*`);
      overdue.forEach(p => parts.push(fmt(p)));
    }

    if (soon.length > 0) {
      parts.push(`\n🟡 *Vencendo em até 3 dias (${soon.length}):*`);
      soon.forEach(p => parts.push(fmt(p)));
    }

    const text = parts.join('\n');

    try {
      await whatsAppService.sendTextMessage(CELITA_PHONE, text);
      console.log(`[PayableService] Alerta de contas enviado para Celita: ${overdue.length} vencidas, ${soon.length} vencendo em breve.`);
    } catch (err: any) {
      console.error('[PayableService] Erro ao enviar alerta de contas:', err?.message);
    }
  }
}
