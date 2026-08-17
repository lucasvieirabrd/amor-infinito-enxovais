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

/**
 * Retorna true se a régua manda cobrar no dia X de atraso da parcela mais antiga.
 * Regra: dias exatos 3, 7, 15, 30 OU múltiplos de 30 acima de 30 (60, 90, 120, ...).
 */
function shouldSendOnDay(days: number): boolean {
  if ([3, 7, 15, 30].includes(days)) return true;
  if (days > 30 && days % 30 === 0) return true;
  return false;
}

/** Converte uma data para o fuso America/Sao_Paulo e retorna startOfDay local */
function toSPDay(date: Date | string): Date {
  return startOfDay(
    new Date(new Date(date).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  );
}

/** Dias de atraso em Sao Paulo (positivo = atrasado, 0 = hoje, negativo = futuro) */
function daysDiffSP(dueDate: Date | string): number {
  const todaySP = toSPDay(new Date());
  const dueSP = toSPDay(dueDate);
  return differenceInDays(todaySP, dueSP);
}

export class BillingService {
  // ─── Deduplicação ────────────────────────────────────────────────────────────

  /**
   * Verifica se já foi enviada alguma mensagem de cobrança para este cliente hoje
   * (America/Sao_Paulo). Garante no máximo 1 cobrança por cliente por dia.
   */
  private async _alreadySentToday(customerId: string): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM messages
      WHERE customer_id = ${customerId}
        AND tag         = 'cobrança'
        AND direction   = 'outbound'
        AND status      = 'sent'
        AND deleted_at  IS NULL
        AND DATE(CONVERT_TZ(timestamp, '+00:00', '-03:00'))
            = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
    `);
    return Number((result as any)[0]?.[0]?.cnt ?? 0) > 0;
  }

  // ─── Lógica central (cron + manual + preview) ─────────────────────────────

  /**
   * Motor único de cobrança — usado pelo cron 08h00, pelo disparo manual e pela prévia.
   *
   * Comportamento:
   *   - Agrupa parcelas por cliente (sem N+1 de query: 1 SELECT único)
   *   - Para cada cliente, pega a parcela MAIS ANTIGA em atraso
   *   - Aplica a régua (dias 3/7/15/30/60/90/...) para cobranca_parcela
   *   - Clientes sem atraso mas com vencimento HOJE recebem lembrete_vencimento
   *   - Deduplicação via messages: pula se já enviou hoje
   *   - dryRun=true retorna contagens sem enviar nada (usado na prévia do modal)
   */
  private async _runBilling(dryRun = false): Promise<{
    sent: number; success: number; failed: number;
    notifiedCustomers: string[];
    todayClients: number; overdueClients: number;
  }> {
    const stats = {
      sent: 0, success: 0, failed: 0,
      notifiedCustomers: [] as string[],
      todayClients: 0, overdueClients: 0,
    };

    // 1. Uma query única: parcelas pendentes/atrasadas/parciais até hoje (SP)
    const rows = await db
      .select({ installment: installments, customer: customers })
      .from(installments)
      .innerJoin(customers, eq(installments.customerId, customers.id))
      .where(
        and(
          sql`${installments.status} IN ('pending', 'overdue', 'partial')`,
          sql`DATE(CONVERT_TZ(${installments.dueDate}, '+00:00', '-03:00')) <= DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))`,
          isNull(installments.deletedAt),
          isNull(customers.deletedAt),
          sql`${customers.inLegalProcess} = 0`,
        )
      );

    console.log(`[BillingService] _runBilling(dryRun=${dryRun}): ${rows.length} parcela(s) em ${new Set(rows.map(r => r.customer.id)).size} cliente(s)`);

    // 2. Agrupar por cliente
    const byCustomer = new Map<string, {
      customer: typeof rows[0]['customer'];
      insts: (typeof rows[0]['installment'])[];
    }>();
    for (const row of rows) {
      if (!byCustomer.has(row.customer.id)) {
        byCustomer.set(row.customer.id, { customer: row.customer, insts: [] });
      }
      byCustomer.get(row.customer.id)!.insts.push(row.installment);
    }

    // 3. Processar cada cliente
    for (const { customer, insts } of byCustomer.values()) {
      // 3a. Deduplicação (aplica tanto no cron quanto no manual e na prévia)
      const alreadySent = await this._alreadySentToday(customer.id);
      if (alreadySent) {
        console.log(`[BillingService] Dedup: já enviado hoje para ${customer.name}, pulando`);
        continue;
      }

      // 3b. Separar: atrasadas (daysDiff > 0) vs vencendo hoje (daysDiff === 0)
      type InstRow = (typeof insts)[0];
      const overdueInsts: InstRow[] = [];
      const todayInsts: InstRow[] = [];

      for (const inst of insts) {
        const d = daysDiffSP(inst.dueDate);
        if (d > 0) overdueInsts.push(inst);
        else if (d === 0) todayInsts.push(inst);
      }

      // 3c. Decidir template e parcela-alvo
      let templateName = '';
      let targetInst: InstRow | null = null;
      let clientDays = 0;

      if (overdueInsts.length > 0) {
        // Parcela mais antiga = maior daysDiff
        let oldest = overdueInsts[0];
        let maxDays = daysDiffSP(oldest.dueDate);
        for (const inst of overdueInsts) {
          const d = daysDiffSP(inst.dueDate);
          if (d > maxDays) { maxDays = d; oldest = inst; }
        }
        clientDays = maxDays;

        if (shouldSendOnDay(clientDays)) {
          templateName = 'cobranca_parcela';
          targetInst = oldest;
        } else {
          console.log(`[BillingService] ${customer.name}: ${clientDays}d de atraso — fora da régua, pulando`);
        }
      } else if (todayInsts.length > 0) {
        templateName = 'lembrete_vencimento';
        targetInst = todayInsts[0];
        clientDays = 0;
      }

      if (!templateName || !targetInst) continue;

      // 3d. Contar
      stats.sent++;
      stats.notifiedCustomers.push(customer.name);
      if (clientDays === 0) stats.todayClients++;
      else stats.overdueClients++;

      if (dryRun) {
        stats.success++;
        continue;
      }

      // 3e. Montar e enviar template
      const dateFmt = format(toSPDay(targetInst.dueDate), 'dd/MM/yyyy');
      const remaining = Number(targetInst.originalAmount) - Number(targetInst.paidAmount || 0);
      const amountNum = formatAmount(remaining);

      let components: any[];
      let contentText: string;

      if (templateName === 'lembrete_vencimento') {
        components = [{
          type: 'body',
          parameters: [
            { type: 'text', text: customer.name },
            { type: 'text', text: `R$ ${amountNum}` },
            { type: 'text', text: dateFmt },
          ],
        }];
        contentText = `Olá ${customer.name} aqui é a Celita da Amor Infinito Enxovais, sua parcela de R$ ${amountNum} venceu hoje dia ${dateFmt}, você faz o pix ou eu passo ai para receber? Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. 😊`;
      } else {
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

      console.log(`[BillingService] Enviando ${templateName} → ${customer.name} (${customer.phone}) | ${clientDays}d`);
      const result = await whatsAppService.sendTemplateMessage(customer.phone, templateName, components);

      if (result && !result.error) {
        stats.success++;
        await saveMessage(result.messages?.[0]?.id, customer.id, customer.phone, contentText, 'template', 'sent', 'Cobrança');
        console.log(`[BillingService] ✓ ${customer.name}`);
      } else {
        stats.failed++;
        await saveMessage(undefined, customer.id, customer.phone, contentText, 'template', 'failed');
        console.error(`[BillingService] ✗ ${customer.name}:`, result?.message);
      }
    }

    console.log(`[BillingService] _runBilling concluído: ${stats.success} sucesso, ${stats.failed} falhas, ${stats.sent} clientes processados`);
    return stats;
  }

  // ─── Cron 08h00 ──────────────────────────────────────────────────────────────

  /**
   * Dispara a régua de cobrança automática (08h00).
   * 1 mensagem por cliente — parcela mais antiga em atraso, com deduplicação.
   */
  async processDailyBilling() {
    console.log('[BillingService] processDailyBilling iniciado');
    const stats = await this._runBilling(false);
    console.log(`[BillingService] processDailyBilling concluído: ${stats.success} clientes notificados, ${stats.failed} falhas`);
    return stats;
  }

  // ─── Disparo manual ───────────────────────────────────────────────────────────

  /**
   * Mesma lógica da régua automática — 1 msg por cliente, régua + dedup.
   * Mantido para compatibilidade com chamadas internas.
   */
  async processOverdueBilling() {
    return this._runBilling(false);
  }

  /**
   * Disparo manual completo (botão "Disparar Cobranças").
   * Usa a mesma régua e deduplicação do cron automático.
   */
  async processAllBilling() {
    return this._runBilling(false);
  }

  // ─── Prévia do modal ──────────────────────────────────────────────────────────

  /**
   * Retorna quantos CLIENTES receberiam mensagem SE disparado agora,
   * já aplicando a régua e a deduplicação (inclui os que já foram enviados hoje).
   */
  async getChargesPreview() {
    const dry = await this._runBilling(true);
    return {
      todayClients:  dry.todayClients,
      overdueClients: dry.overdueClients,
      totalClients:  dry.success,
      todayCount:    dry.todayClients,   // compat frontend
      overdueCount:  dry.overdueClients, // compat frontend
      totalCount:    dry.success,        // compat frontend
    };
  }

  // ─── Cron 11h00 ──────────────────────────────────────────────────────────────

  /**
   * Envia o resumo diário para os 3 administradores (11h00).
   * Conta CLIENTES distintos notificados hoje (não parcelas).
   * TEMPLATE 4 — msg_resumo_vencimento
   * {{1}}=data, {{2}}=total clientes, {{3}}=sucesso, {{4}}=falhas, {{5}}=lista de clientes
   */
  async sendDailySummary() {
    const todayStr = format(new Date(), 'dd/MM/yyyy');

    const statsResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT m.customer_id)                                                               AS total_clients,
        COUNT(DISTINCT CASE WHEN m.status = 'sent'   THEN m.customer_id ELSE NULL END)             AS success_clients,
        COUNT(DISTINCT CASE WHEN m.status = 'failed' THEN m.customer_id ELSE NULL END)             AS failed_clients,
        GROUP_CONCAT(
          DISTINCT CASE WHEN m.status = 'sent' THEN c.name ELSE NULL END
          ORDER BY c.name SEPARATOR ', '
        )                                                                                           AS clients
      FROM messages m
      LEFT JOIN customers c ON m.customer_id = c.id
      WHERE m.direction  = 'outbound'
        AND m.tag        = 'cobrança'
        AND m.deleted_at IS NULL
        AND DATE(CONVERT_TZ(m.timestamp, '+00:00', '-03:00'))
            = DATE(CONVERT_TZ(NOW(), '+00:00', '-03:00'))
    `);

    const row            = (statsResult as any)[0]?.[0] ?? {};
    const totalClients   = Number(row.total_clients   ?? 0);
    const successClients = Number(row.success_clients ?? 0);
    const failedClients  = Number(row.failed_clients  ?? 0);
    const clientsList    = row.clients ? String(row.clients) : 'Nenhum';

    console.log(`[BillingService] sendDailySummary: ${totalClients} clientes — ${successClients} sucesso, ${failedClients} falhas`);

    const components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: todayStr },
        { type: 'text', text: String(totalClients) },
        { type: 'text', text: String(successClients) },
        { type: 'text', text: String(failedClients) },
        { type: 'text', text: clientsList },
      ],
    }];

    for (const phone of ADMIN_PHONES) {
      const result = await whatsAppService.sendTemplateMessage(phone, 'msg_resumo_vencimento', components);

      if (!result || result.error) {
        const text =
          `Celita, aqui está o resumo de cobranças do dia ${todayStr}:\n` +
          `👥 Clientes notificados: ${totalClients}\n` +
          `✅ Sucesso: ${successClients}\n` +
          `❌ Falha: ${failedClients}\n` +
          `Clientes notificados hoje:\n- ${clientsList}\n` +
          `Acesse o sistema para mais detalhes.`;
        await whatsAppService.sendTextMessage(phone, text);
      }
    }
  }

  // ─── Cron 07h30 ──────────────────────────────────────────────────────────────

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

  // ─── Pós-pagamento ────────────────────────────────────────────────────────────

  /**
   * Confirmação de pagamento ao cliente.
   * TEMPLATE 3 — confirmacao_pagamento
   * {{1}}=nome, {{2}}="150,00" (template já tem "R$")
   */
  async sendPaymentConfirmation(customerId: string, amount: number) {
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) return;

    const amountNum = formatAmount(amount);

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
   * Envia o template saldo_parcelas após confirmação de pagamento.
   * {{1}}=nome, {{2}}=qtd parcelas restantes, {{3}}=valor da parcela
   */
  async sendSaldoParcelas(customerId: string, remaining: any[]): Promise<void> {
    try {
      if (remaining.length === 0) return;

      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer[0]) return;

      const count = remaining.length;
      const installmentValue = formatAmount(remaining[0].originalAmount);

      const components = [{
        type: 'body',
        parameters: [
          { type: 'text', text: customer[0].name },
          { type: 'text', text: String(count) },
          { type: 'text', text: installmentValue },
        ],
      }];

      const contentText =
        `Olá ${customer[0].name}! Após este pagamento, restam ${count} parcelas de R$ ${installmentValue} ` +
        `para a quitação. Qualquer dúvida estamos à disposição! 😊`;

      const result = await whatsAppService.sendTemplateMessage(
        customer[0].phone,
        'saldo_parcelas',
        components,
      );

      if (result && !result.error) {
        await saveMessage(result.messages?.[0]?.id, customer[0].id, customer[0].phone, contentText, 'template', 'sent', 'Pago');
        console.log(`[BillingService] saldo_parcelas enviado para ${customer[0].name}: ${count} parcela(s) restante(s)`);
      } else {
        console.warn(`[BillingService] saldo_parcelas falhou para ${customer[0].name}:`, result?.message);
      }
    } catch (err: any) {
      console.error('[BillingService] sendSaldoParcelas error (ignorado):', err?.message);
    }
  }

  /**
   * Envia o template quitacao_parcelas quando o cliente quita a última parcela.
   * {{1}}=nome do cliente
   */
  async sendQuitacaoParcelas(customerId: string): Promise<void> {
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) return;

    const contentText =
      `Olá ${customer[0].name}, confirmamos a quitação de todas as parcelas do seu crediário com a ` +
      `Amor Infinito Enxovais. Seu saldo devedor está zerado. Guarde esta mensagem como comprovante.`;

    const components = [{
      type: 'body',
      parameters: [{ type: 'text', text: customer[0].name }],
    }];

    const result = await whatsAppService.sendTemplateMessage(customer[0].phone, 'quitacao_parcelas', components);

    if (result && !result.error) {
      await saveMessage(result.messages?.[0]?.id, customer[0].id, customer[0].phone, contentText, 'template', 'sent', 'Pago');
      console.log(`[BillingService] quitacao_parcelas enviado para ${customer[0].name}`);
    } else {
      console.warn(`[BillingService] quitacao_parcelas template falhou para ${customer[0].name}, tentando texto`);
      const fallback = await whatsAppService.sendTextMessage(customer[0].phone, contentText);
      if (fallback && !fallback.error) {
        await saveMessage(fallback.messages?.[0]?.id, customer[0].id, customer[0].phone, contentText, 'text', 'sent', 'Pago');
      }
    }
  }

  /**
   * Orquestra as mensagens pós-baixa.
   * - remaining > 0 → confirmacao_pagamento + saldo_parcelas
   * - remaining = 0 → quitacao_parcelas
   */
  async handlePostPaymentMessages(customerId: string, saleId: string, paidAmount: number): Promise<void> {
    try {
      const remaining = await db
        .select()
        .from(installments)
        .where(
          and(
            eq(installments.saleId, saleId),
            sql`${installments.status} IN ('pending', 'overdue')`,
            sql`${installments.installmentNumber} > 0`,
            isNull(installments.deletedAt),
          )
        );

      if (remaining.length > 0) {
        await this.sendPaymentConfirmation(customerId, paidAmount);
        await this.sendSaldoParcelas(customerId, remaining);
      } else {
        await this.sendQuitacaoParcelas(customerId);
      }
    } catch (err: any) {
      console.error('[BillingService] handlePostPaymentMessages error (ignorado):', err?.message);
    }
  }

  // ─── Envio manual individual ──────────────────────────────────────────────────

  /**
   * Envio manual de cobrança individual (botão "Cobrar Agora").
   * TEMPLATE 2 — cobranca_parcela
   * Respeita inLegalProcess mas NÃO aplica dedup (ação deliberada do admin).
   */
  async sendManualBillingMessage(customerId: string, installmentId: string) {
    const installment = await installmentRepository.findById(installmentId);
    if (!installment) throw new AppError('Parcela não encontrada', 404);

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer[0]) throw new AppError('Cliente não encontrado', 404);

    if (customer[0].inLegalProcess) {
      throw new AppError('Cliente em processo jurídico não pode receber cobrança automática', 400);
    }

    const dateFmt = format(toSPDay(installment.dueDate), 'dd/MM/yyyy');
    const amountNum = formatAmount(installment.originalAmount);

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

  // ─── Histórico de mensagens ───────────────────────────────────────────────────

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
}
