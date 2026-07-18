import { PayableRepository } from '../repositories/payable.repository';
import { AppError } from '../utils/AppError';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { getDaysInMonth } from 'date-fns';
import { db } from '../database';
import { auditLogs, messages } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

const payableRepository = new PayableRepository();
const whatsAppService = new WhatsAppService();

const CELITA_PHONE = '5516997977302';
const BOLETO_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const BOLETO_ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

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

  // ─── Boleto ───────────────────────────────────────────────────────────────────

  async uploadBoleto(id: string, userId: string, buffer: Buffer, originalname: string, mimetype: string, size: number) {
    if (!BOLETO_ALLOWED_MIMETYPES.includes(mimetype)) {
      throw new AppError('Tipo de arquivo não permitido. Use PDF, JPEG, PNG ou WebP.', 400);
    }
    if (size > BOLETO_MAX_SIZE) {
      throw new AppError('Arquivo muito grande. Limite máximo: 5MB.', 400);
    }

    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);

    await payableRepository.uploadBoleto(id, buffer, originalname, mimetype, size);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'UPLOAD_BOLETO',
      entityType: 'Payable',
      entityId: id,
      oldValue: existing.boletoFilename ? { filename: existing.boletoFilename } : null,
      newValue: { filename: originalname, size, mimetype },
    });
  }

  async getBoleto(id: string) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);

    const boleto = await payableRepository.getBoleto(id);
    if (!boleto) throw new AppError('Nenhum boleto anexado a esta conta', 404);

    return boleto;
  }

  async removeBoleto(id: string, userId: string) {
    const existing = await payableRepository.findPayableById(id);
    if (!existing) throw new AppError('Conta não encontrada', 404);
    if (!existing.boletoFilename) throw new AppError('Nenhum boleto anexado a esta conta', 404);

    const oldFilename = existing.boletoFilename;
    await payableRepository.clearBoleto(id);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'DELETE_BOLETO',
      entityType: 'Payable',
      entityId: id,
      oldValue: { filename: oldFilename },
      newValue: null,
    });
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

    // 1º — enviar texto (resumo)
    try {
      await whatsAppService.sendTextMessage(CELITA_PHONE, text);
      console.log(`[PayableService] Alerta de contas enviado para Celita: ${overdue.length} vencidas, ${soon.length} vencendo em breve.`);
    } catch (err: any) {
      console.error('[PayableService] Erro ao enviar alerta de contas (texto):', err?.message);
    }

    // 2º — boletos vencendo HOJE: upload → sendDocument, um por vez
    const boletosHoje = await payableRepository.findBoletosForToday();
    if (boletosHoje.length === 0) return;

    console.log(`[PayableService] Enviando ${boletosHoje.length} boleto(s) vencendo hoje para Celita...`);

    for (const boleto of boletosHoje) {
      const dateStr = new Date(boleto.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const caption = `📎 Boleto: ${boleto.description} — vence hoje ${dateStr}`;

      try {
        const mediaId = await whatsAppService.uploadMedia(
          boleto.boletoBuffer,
          boleto.boletoMimetype,
          boleto.boletoFilename,
        );

        const result = await whatsAppService.sendDocumentMessage(
          CELITA_PHONE,
          mediaId,
          boleto.boletoFilename,
          caption,
        );

        if (result && !result.error) {
          await db.insert(messages).values({
            id: uuidv4(),
            metaMessageId: result.messages?.[0]?.id ?? null,
            customerId: null,
            fromPhone: 'SISTEMA',
            toPhone: CELITA_PHONE,
            type: 'document',
            content: caption,
            mediaId,
            mediaFilename: boleto.boletoFilename,
            direction: 'outbound',
            status: 'sent',
            tag: 'none',
            timestamp: new Date(),
          });
          console.log(`[PayableService] Boleto enviado ✓: ${boleto.boletoFilename}`);
        } else {
          await db.insert(messages).values({
            id: uuidv4(),
            customerId: null,
            fromPhone: 'SISTEMA',
            toPhone: CELITA_PHONE,
            type: 'document',
            content: caption,
            direction: 'outbound',
            status: 'failed',
            tag: 'none',
            errorMessage: result?.message ?? 'Erro desconhecido ao enviar documento',
            timestamp: new Date(),
          });
          console.error(`[PayableService] Falha ao enviar boleto ${boleto.boletoFilename}:`, result?.message);
        }
      } catch (err: any) {
        console.error(`[PayableService] Erro inesperado ao enviar boleto ${boleto.boletoFilename}:`, err?.message);
        // não interrompe o loop — próximo boleto continua
      }
    }
  }
}
