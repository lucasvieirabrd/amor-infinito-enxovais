import { WhatsAppService } from '../integrations/whatsapp.service';
import { InstallmentRepository } from '../repositories/installment.repository';
import { MessageRepository } from '../repositories/message.repository';
import { AppError } from '../utils/AppError';
import { db } from '../database';
import { settings, customers, installments } from '../database/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const whatsAppService = new WhatsAppService();
const installmentRepository = new InstallmentRepository();
const messageRepository = new MessageRepository();

export class BillingService {
  /**
   * Dispara a régua de cobrança automática (08h00).
   */
  async processDailyBilling() {
    const today = startOfDay(new Date());
    const stats = { sent: 0, success: 0, failed: 0, notifiedClients: [] as string[] };

    // Buscar configurações de PIX
    const pixKeyResult = await db.select().from(settings).where(eq(settings.key, 'pix_key')).limit(1);
    const pixKey = pixKeyResult[0]?.value || '';

    // Buscar todas as parcelas pendentes ou vencidas
    const pendingInstallments = await db
      .select({
        installment: installments,
        customer: customers,
      })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          eq(installments.status, 'pending'),
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );

    for (const row of pendingInstallments) {
      const { installment, customer } = row;
      const dueDate = startOfDay(new Date(installment.dueDate));
      const daysDiff = differenceInDays(today, dueDate);

      let templateName = '';
      let components: any[] = [];

      const amountFmt = `R$ ${parseFloat(installment.originalAmount.toString()).toFixed(2)}`;
      const dateFmt   = format(dueDate, 'dd/MM/yyyy');

      if (daysDiff === 0) {
        // Lembrete de vencimento (vence hoje)
        templateName = 'lembrete_vencimento';
        components = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customer.name },
              { type: 'text', text: amountFmt },
              { type: 'text', text: dateFmt },
            ],
          },
        ];
      } else if ([2, 3, 5, 10, 20].includes(daysDiff)) {
        // Régua de cobrança (venceu há X dias)
        templateName = 'cobranca_parcela';
        components = [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customer.name },
              { type: 'text', text: parseFloat(installment.originalAmount.toString()).toFixed(2) },
              { type: 'text', text: dateFmt },
            ],
          },
        ];
      }

      if (templateName) {
        stats.sent++;
        const result = await whatsAppService.sendTemplateMessage(customer.phone, templateName, components);

        if (result && !result.error) {
          stats.success++;
          stats.notifiedClients.push(customer.name);

          const contentText = templateName === 'lembrete_vencimento'
            ? `Olá ${customer.name}, sua parcela de ${amountFmt} vence hoje (${dateFmt}). Por favor efetue o pagamento. 😊`
            : `Olá ${customer.name}, sua parcela de ${amountFmt} venceu em ${dateFmt}. Entre em contato para regularizar. 🙏`;

          await messageRepository.create({
            metaMessageId: result.messages?.[0]?.id,
            customerId: customer.id,
            fromPhone: 'SISTEMA',
            toPhone: customer.phone,
            type: 'template',
            content: contentText,
            direction: 'outbound',
            status: 'sent',
            timestamp: new Date(),
          });
        } else {
          stats.failed++;
        }
      }
    }

    return stats;
  }

  /**
   * Envia o resumo diário para os administradores (11h00).
   */
  async sendDailySummary(stats: any) {
    const adminPhonesResult = await db.select().from(settings).where(eq(settings.key, 'admin_phone_numbers')).limit(1);
    const adminPhones = adminPhonesResult[0]?.value?.split(',') || [];

    const todayStr = format(new Date(), 'dd/MM/yyyy');
    const clientsList = stats.notifiedClients.join('\n- ');
    
    const messageText = `Celita, aqui está o resumo de cobranças do dia ${todayStr}:\n` +
      `📤 Total enviado: ${stats.sent}\n` +
      `✅ Sucesso: ${stats.success}\n` +
      `❌ Falha: ${stats.failed}\n` +
      `Clientes notificados hoje:\n- ${clientsList || 'Nenhum'}\n` +
      `Acesse o sistema para mais detalhes.`;

    for (const phone of adminPhones) {
      await whatsAppService.sendTextMessage(phone.trim(), messageText);
    }
  }

  /**
   * Envia confirmação de pagamento.
   */
  async sendPaymentConfirmation(customerId: string, amount: number, installmentNumber?: number) {
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) return;

    const templateName = 'confirmacao_pagamento';
    const components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: customer[0].name },
          { type: 'text', text: amount.toFixed(2) },
          ...(installmentNumber ? [{ type: 'text', text: String(installmentNumber) }] : []),
        ],
      },
    ];

    const result = await whatsAppService.sendTemplateMessage(customer[0].phone, templateName, components);

    if (result && !result.error) {
      await messageRepository.create({
        metaMessageId: result.messages?.[0]?.id,
        customerId: customer[0].id,
        fromPhone: 'SISTEMA',
        toPhone: customer[0].phone,
        type: 'template',
        content: `Olá ${customer[0].name}, confirmamos o recebimento do seu pagamento de R$ ${amount.toFixed(2)}. Obrigado! ✅`,
        direction: 'outbound',
        status: 'sent',
        timestamp: new Date(),
      });
    } else {
      // Fallback: mensagem de texto simples
      const installmentInfo = installmentNumber ? ` da parcela ${installmentNumber}` : '';
      const text = `Olá ${customer[0].name}! Confirmamos o recebimento do seu pagamento${installmentInfo} no valor de R$ ${amount.toFixed(2)}. Obrigada pela preferência! 💜 Amor Infinito Enxovais`;
      const fallbackResult = await whatsAppService.sendTextMessage(customer[0].phone, text);
      if (fallbackResult && !fallbackResult.error) {
        await messageRepository.create({
          metaMessageId: fallbackResult.messages?.[0]?.id,
          customerId: customer[0].id,
          fromPhone: 'SISTEMA',
          toPhone: customer[0].phone,
          type: 'text',
          content: text,
          direction: 'outbound',
          status: 'sent',
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Envia cobrança para TODAS as parcelas atrasadas (vencimento < hoje, status pending ou overdue).
   * Usado pelo cron das 08h30 e pelo botão manual do frontend.
   */
  async processOverdueBilling() {
    const stats = { sent: 0, success: 0, failed: 0 };

    const rows = await db
      .select({ installment: installments, customer: customers })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          sql`status IN ('pending', 'overdue')`,
          sql`DATE(due_date) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))`,
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );

    for (const row of rows) {
      const { installment, customer } = row;
      const dueDate = new Date(installment.dueDate);
      const amountFmt = `R$ ${parseFloat(installment.originalAmount.toString()).toFixed(2)}`;
      const dateFmt = format(dueDate, 'dd/MM/yyyy');

      const components = [{
        type: 'body',
        parameters: [
          { type: 'text', text: customer.name },
          { type: 'text', text: parseFloat(installment.originalAmount.toString()).toFixed(2) },
          { type: 'text', text: dateFmt },
        ],
      }];

      stats.sent++;
      const result = await whatsAppService.sendTemplateMessage(customer.phone, 'cobranca_parcela', components);

      if (result && !result.error) {
        stats.success++;
        await messageRepository.create({
          metaMessageId: result.messages?.[0]?.id,
          customerId: customer.id,
          fromPhone: 'SISTEMA',
          toPhone: customer.phone,
          type: 'template',
          content: `Olá ${customer.name}, sua parcela de ${amountFmt} venceu em ${dateFmt}. Entre em contato para regularizar. 🙏`,
          direction: 'outbound',
          status: 'sent',
          tag: 'cobrança',
          timestamp: new Date(),
        });
      } else {
        stats.failed++;
      }
    }

    return stats;
  }

  /**
   * Disparo manual completo: vencendo hoje + todas atrasadas.
   */
  async processAllBilling() {
    const [todayStats, overdueStats] = await Promise.all([
      this.processDailyBilling(),
      this.processOverdueBilling(),
    ]);
    return {
      sent: todayStats.sent + overdueStats.sent,
      success: todayStats.success + overdueStats.success,
      failed: todayStats.failed + overdueStats.failed,
    };
  }

  /**
   * Prévia: quantas mensagens seriam enviadas ao disparar manualmente.
   */
  async getChargesPreview() {
    const result = await db.execute(sql`
      SELECT
        SUM(CASE WHEN DATE(due_date) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) AND status = 'pending' THEN 1 ELSE 0 END) as todayCount,
        SUM(CASE WHEN DATE(due_date) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) AND status IN ('pending','overdue') THEN 1 ELSE 0 END) as overdueCount
      FROM installments
      WHERE deleted_at IS NULL
    `);
    const row = ((result as any)[0]?.[0]) ?? {};
    return {
      todayCount: Number(row.todayCount ?? 0),
      overdueCount: Number(row.overdueCount ?? 0),
      totalCount: Number(row.todayCount ?? 0) + Number(row.overdueCount ?? 0),
    };
  }

  /**
   * Lista mensagens de cobrança enviadas (outbound template com tag cobrança).
   */
  async getBillingMessages(period: string) {
    const intervalMap: Record<string, string> = {
      today: '0 DAY',
      '7d': '6 DAY',
      '30d': '29 DAY',
    };
    const interval = intervalMap[period] ?? '0 DAY';

    const result = await db.execute(sql`
      SELECT
        m.id,
        m.content,
        m.status,
        m.timestamp,
        m.to_phone as phone,
        c.name as customerName
      FROM messages m
      LEFT JOIN customers c ON m.customer_id = c.id
      WHERE m.direction = 'outbound'
        AND m.type = 'template'
        AND m.deleted_at IS NULL
        AND DATE(CONVERT_TZ(m.timestamp, '+00:00', '-03:00'))
            >= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) - INTERVAL ${sql.raw(interval)}
      ORDER BY m.timestamp DESC
      LIMIT 200
    `);
    return ((result as any)[0] ?? []).map((row: any) => ({
      id: row.id,
      customerName: row.customerName ?? 'Desconhecido',
      phone: row.phone,
      content: row.content,
      status: row.status,
      timestamp: row.timestamp,
    }));
  }

  async sendManualBillingMessage(customerId: string, installmentId: string) {
    const installment = await installmentRepository.findById(installmentId);
    if (!installment) {
      throw new AppError("Parcela não encontrada", 404);
    }

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) {
      throw new AppError("Cliente não encontrado", 404);
    }

    const templateName = "cobranca_parcela";
    const components = [
      {
        type: "body",
        parameters: [
          { type: "text", text: customer[0].name },
          { type: "text", text: parseFloat(installment.originalAmount.toString()).toFixed(2) },
          { type: "text", text: format(new Date(installment.dueDate), "dd/MM/yyyy") },
        ],
      },
    ];

    const result = await whatsAppService.sendTemplateMessage(customer[0].phone, templateName, components);

    if (result && !result.error) {
      const amountFmt = `R$ ${parseFloat(installment.originalAmount.toString()).toFixed(2)}`;
      const dateFmt   = format(new Date(installment.dueDate), 'dd/MM/yyyy');
      await messageRepository.create({
        metaMessageId: result.messages?.[0]?.id,
        customerId: customer[0].id,
        fromPhone: "SISTEMA",
        toPhone: customer[0].phone,
        type: "template",
        content: `Olá ${customer[0].name}, sua parcela de ${amountFmt} venceu em ${dateFmt}. Entre em contato para regularizar. 🙏`,
        direction: "outbound",
        status: "sent",
        timestamp: new Date(),
      });
    }

    return result;
  }
}
