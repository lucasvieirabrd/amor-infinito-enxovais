import { WhatsAppService } from '../integrations/whatsapp.service';
import { InstallmentRepository } from '../repositories/installment.repository';
import { MessageRepository } from '../repositories/message.repository';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/normalizePhone';
import { db } from '../database';
import { customers, installments } from '../database/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { generateRelatorioCobrancaPdf } from './relatorioCobranca.service';

const whatsAppService = new WhatsAppService();
const installmentRepository = new InstallmentRepository();
const messageRepository = new MessageRepository();

// Números fixos para o relatório diário
const ADMIN_PHONES = [
  '+5516982015465',
  '+5516997977302',
  '+5516981271021',
];

/** Formata valor monetário em padrão pt-BR: 150,00 (sem "R$") */
const formatAmount = (value: number | string) =>
  parseFloat(value.toString()).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Salva mensagem enviada (ou com falha) no banco e opcionalmente atualiza a tag da conversa */
async function saveMessage(
  metaMessageId: string | undefined,
  customerId: string,
  toPhone: string,
  content: string,
  type: 'template' | 'text' = 'template',
  status: 'sent' | 'failed' = 'sent',
  conversationTag?: string,
) {
  await messageRepository.create({
    metaMessageId,
    customerId,
    fromPhone: 'SISTEMA',
    toPhone,
    type,
    content,
    direction: 'outbound',
    status,
    tag: 'cobrança',
    timestamp: new Date(),
  });

  if (status === 'sent' && conversationTag) {
    await messageRepository.upsertConversationTag(normalizePhone(toPhone), conversationTag);
  }
}

export class BillingService {
  /**
   * Dispara a régua de cobrança automática (08h00).
   * Template 1 (lembrete_vencimento): vence hoje
   * Template 2 (cobranca_parcela): atrasadas nos dias 2,3,5,10,20
   */
  async processDailyBilling() {
    const stats = { sent: 0, success: 0, failed: 0, notifiedClients: [] as string[] };

    const pendingInstallments = await db
      .select({ installment: installments, customer: customers })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          sql`${installments.status} IN ('pending', 'overdue', 'partial')`,
          sql`DATE(CONVERT_TZ(${installments.dueDate}, '+00:00', '-03:00')) <= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))`,
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );

    console.log(`[BillingService] processDailyBilling: ${pendingInstallments.length} parcela(s) encontrada(s)`);

    for (const row of pendingInstallments) {
      const { installment, customer } = row;
      const dueDateSP = new Date(new Date(installment.dueDate).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todaySP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dueDate = startOfDay(dueDateSP);
      const daysDiff = differenceInDays(startOfDay(todaySP), dueDate);
      const dateFmt = format(dueDate, 'dd/MM/yyyy');
      const remaining = Number(installment.originalAmount) - Number(installment.paidAmount || 0);
      const amountNum = formatAmount(remaining);

      let templateName = '';
      let components: any[] = [];
      let contentText = '';

      if (daysDiff === 0) {
        templateName = 'lembrete_vencimento';
        components = [{
          type: 'body',
          parameters: [
            { type: 'text', text: customer.name },
            { type: 'text', text: `R$ ${amountNum}` },
            { type: 'text', text: dateFmt },
          ],
        }];
        contentText = `Olá ${customer.name} aqui é a Celita da Amor Infinito Enxovais, sua parcela de R$ ${amountNum} venceu hoje dia ${dateFmt}, você faz o pix ou eu passo ai para receber?`;
      } else if ([2, 3, 5, 10, 20].includes(daysDiff)) {
        templateName = 'cobranca_parcela';
        components = [{
          type: 'body',
          parameters: [
            { type: 'text', text: customer.name },
            { type: 'text', text: amountNum },
            { type: 'text', text: dateFmt },
          ],
        }];
        contentText = `Olá ${customer.name}, sua parcela de R$ ${amountNum} venceu em ${dateFmt} e está pendente. Por favor, regularize o pagamento o quanto antes.`;
      }

      if (!templateName) {
        console.log(`[BillingService] Parcela ${installment.id} (${customer.name}, ${daysDiff}d) — sem template para hoje, pulando`);
        continue;
      }

      console.log(`[BillingService] Enviando ${templateName} para ${customer.name} (${customer.phone}) — ${daysDiff}d de atraso`);
      stats.sent++;
      const result = await whatsAppService.sendTemplateMessage(customer.phone, templateName, components);

      if (result && !result.error) {
        stats.success++;
        stats.notifiedClients.push(customer.name);
        console.log(`[BillingService] ✓ Enviado para ${customer.name}`);
        await saveMessage(result.messages?.[0]?.id, customer.id, customer.phone, contentText, 'template', 'sent', 'Cobrança');
      } else {
        stats.failed++;
        console.error(`[BillingService] ✗ Falha ao enviar para ${customer.name}:`, result?.message);
        await saveMessage(undefined, customer.id, customer.phone, contentText, 'template', 'failed');
      }
    }

    console.log(`[BillingService] processDailyBilling concluído: ${stats.success} enviados, ${stats.failed} falhas`);
    return stats;
  }

  /**
   * Envia o resumo diário para os 3 administradores via template (11h00).
   * Consulta o banco para obter as estatísticas do dia — resistente a restarts do servidor.
   * TEMPLATE 4 — msg_resumo_vencimento
   * {{1}}=data, {{2}}=total enviado, {{3}}=sucesso, {{4}}=falhas, {{5}}=lista de clientes
   */
  async sendDailySummary() {
    const todayStr = format(new Date(), 'dd/MM/yyyy');

    // Lê do banco — não depende de estado em memória
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*)                                                          AS total,
        SUM(CASE WHEN m.status = 'sent'   THEN 1 ELSE 0 END)            AS success,
        SUM(CASE WHEN m.status = 'failed' THEN 1 ELSE 0 END)            AS failed,
        GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')             AS clients
      FROM messages m
      LEFT JOIN customers c ON m.customer_id = c.id
      WHERE m.direction  = 'outbound'
        AND m.tag        = 'cobrança'
        AND m.deleted_at IS NULL
        AND DATE(CONVERT_TZ(m.timestamp, '+00:00', '-03:00'))
            = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
    `);

    const row = (statsResult as any)[0]?.[0] ?? {};
    const sent    = Number(row.total   ?? 0);
    const success = Number(row.success ?? 0);
    const failed  = Number(row.failed  ?? 0);
    const clientsList = row.clients ? String(row.clients) : 'Nenhum';

    console.log(`[BillingService] sendDailySummary: total=${sent} sucesso=${success} falhas=${failed} clientes=${clientsList}`);

    const components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: todayStr },
        { type: 'text', text: String(sent) },
        { type: 'text', text: String(success) },
        { type: 'text', text: String(failed) },
        { type: 'text', text: clientsList },
      ],
    }];

    for (const phone of ADMIN_PHONES) {
      const result = await whatsAppService.sendTemplateMessage(phone, 'msg_resumo_vencimento', components);

      if (!result || result.error) {
        const text =
          `Celita, aqui está o resumo de cobranças do dia ${todayStr}:\n` +
          `📤 Total enviado: ${sent}\n` +
          `✅ Sucesso: ${success}\n` +
          `❌ Falha: ${failed}\n` +
          `Clientes notificados hoje:\n- ${clientsList}\n` +
          `Acesse o sistema para mais detalhes.`;
        await whatsAppService.sendTextMessage(phone, text);
      }
    }
  }

  /**
   * Gera o PDF do relatório de cobrança e envia via WhatsApp para os admins (07h30).
   */
  async sendDailyPdfReport(): Promise<{ mediaId: string; results: { phone: string; success: boolean; messageId?: string; error?: string }[] }> {
    const dateStr = format(new Date(), 'dd/MM/yyyy');
    const filename = `relatorio-cobranca-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    const caption = `📊 Relatório de Cobrança - ${dateStr}\nSegue em anexo o relatório completo de cobranças do dia.`;

    const buffer = await generateRelatorioCobrancaPdf();
    console.log(`[BillingService] PDF gerado: ${buffer.length} bytes`);

    const mediaId = await whatsAppService.uploadMedia(buffer, 'application/pdf', filename);
    console.log(`[BillingService] PDF enviado ao WhatsApp Media API, mediaId: ${mediaId}`);

    const results: { phone: string; success: boolean; messageId?: string; error?: string }[] = [];

    for (const phone of ADMIN_PHONES) {
      const result = await whatsAppService.sendDocumentMessage(phone, mediaId, filename, caption);
      if (result?.error) {
        console.error(`[BillingService] ✗ Falha ao enviar PDF para ${phone}:`, result.message);
        results.push({ phone, success: false, error: result.message });
      } else {
        console.log(`[BillingService] ✓ PDF enviado para ${phone}`);
        results.push({ phone, success: true, messageId: result?.messages?.[0]?.id });
      }
    }

    return { mediaId, results };
  }

  /**
   * Confirmação de pagamento ao cliente.
   * TEMPLATE 3 — confirmacao_pagamento
   * {{1}}=nome, {{2}}="150,00" (template já tem "R$")
   */
  async sendPaymentConfirmation(customerId: string, amount: number) {
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) return;

    const amountNum = formatAmount(amount); // "150,00"

    // TEMPLATE 3: apenas 2 variáveis — {{1}}=nome, {{2}}=valor
    const components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: customer[0].name },
        { type: 'text', text: amountNum },
      ],
    }];

    const result = await whatsAppService.sendTemplateMessage(
      customer[0].phone,
      'confirmacao_pagamento',
      components,
    );

    const contentText = `Olá ${customer[0].name}! Confirmamos o recebimento do pagamento da parcela no valor de R$ ${amountNum}. Obrigado pela pontualidade!`;

    if (result && !result.error) {
      await saveMessage(result.messages?.[0]?.id, customer[0].id, customer[0].phone, contentText, 'template', 'sent', 'Pago');
    } else {
      // Fallback: texto simples
      const fallbackResult = await whatsAppService.sendTextMessage(customer[0].phone, contentText);
      if (fallbackResult && !fallbackResult.error) {
        await saveMessage(
          fallbackResult.messages?.[0]?.id,
          customer[0].id,
          customer[0].phone,
          contentText,
          'text',
          'sent',
          'Pago',
        );
      }
    }
  }

  /**
   * Envia cobrança para TODAS as parcelas atrasadas (sem filtro de dias).
   * TEMPLATE 2 — cobranca_parcela
   * Usado pelo disparo manual completo (processAllBilling).
   */
  async processOverdueBilling() {
    const stats = { sent: 0, success: 0, failed: 0 };

    const rows = await db
      .select({ installment: installments, customer: customers })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          sql`${installments.status} IN ('pending', 'overdue', 'partial')`,
          sql`DATE(${installments.dueDate}) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))`,
          isNull(installments.deletedAt),
          isNull(customers.deletedAt)
        )
      );

    for (const row of rows) {
      const { installment, customer } = row;
      const dateFmt = format(new Date(installment.dueDate), 'dd/MM/yyyy');
      const remaining = Number(installment.originalAmount) - Number(installment.paidAmount || 0);
      const amountNum = formatAmount(remaining);

      // TEMPLATE 2: {{1}}=nome, {{2}}="150,00" (sem R$), {{3}}=data
      const components = [{
        type: 'body',
        parameters: [
          { type: 'text', text: customer.name },
          { type: 'text', text: amountNum },
          { type: 'text', text: dateFmt },
        ],
      }];

      stats.sent++;
      const result = await whatsAppService.sendTemplateMessage(customer.phone, 'cobranca_parcela', components);

      if (result && !result.error) {
        stats.success++;
        const contentText = `Olá ${customer.name}, sua parcela de R$ ${amountNum} venceu em ${dateFmt} e está pendente. Por favor, regularize o pagamento o quanto antes.`;
        await saveMessage(result.messages?.[0]?.id, customer.id, customer.phone, contentText, 'template', 'sent', 'Cobrança');
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
        SUM(CASE WHEN DATE(due_date) = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) AND status IN ('pending','partial') THEN 1 ELSE 0 END) as todayCount,
        SUM(CASE WHEN DATE(due_date) < DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00')) AND status IN ('pending','overdue','partial') THEN 1 ELSE 0 END) as overdueCount
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
   * Lista mensagens de cobrança enviadas por período.
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

  /**
   * Envio manual de cobrança individual (botão "Cobrar Agora").
   * TEMPLATE 2 — cobranca_parcela
   */
  async sendManualBillingMessage(customerId: string, installmentId: string) {
    const installment = await installmentRepository.findById(installmentId);
    if (!installment) throw new AppError('Parcela não encontrada', 404);

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) throw new AppError('Cliente não encontrado', 404);

    const dateFmt = format(new Date(installment.dueDate), 'dd/MM/yyyy');
    const amountNum = formatAmount(installment.originalAmount); // "150,00"

    // TEMPLATE 2: {{1}}=nome, {{2}}="150,00" (sem R$), {{3}}=data
    const components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: customer[0].name },
        { type: 'text', text: amountNum },
        { type: 'text', text: dateFmt },
      ],
    }];

    const result = await whatsAppService.sendTemplateMessage(customer[0].phone, 'cobranca_parcela', components);

    if (result && !result.error) {
      const contentText = `Olá ${customer[0].name}, sua parcela de R$ ${amountNum} venceu em ${dateFmt} e está pendente. Por favor, regularize o pagamento o quanto antes.`;
      await saveMessage(result.messages?.[0]?.id, customer[0].id, customer[0].phone, contentText, 'template', 'sent', 'Cobrança');
    }

    return result;
  }
}
