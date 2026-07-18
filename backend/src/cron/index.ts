import cron from 'node-cron';
import { BillingService } from '../services/billing.service';
import { PayableService } from '../services/payable.service';
import { db } from '../database';
import { sql } from 'drizzle-orm';

const billingService = new BillingService();
const payableService = new PayableService();

/**
 * Agendamento de tarefas automáticas.
 * Fuso horário: America/Sao_Paulo
 */
export function setupCronJobs() {
  // 07h30: Enviar PDF do relatório de cobrança para administradores
  cron.schedule('30 7 * * *', async () => {
    console.log('[CRON] Iniciando envio do PDF de cobrança (07h30)...');
    try {
      await billingService.sendDailyPdfReport();
      console.log('[CRON] PDF de cobrança enviado com sucesso.');
    } catch (error: any) {
      console.error('[CRON] Erro ao enviar PDF de cobrança:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 08h00: Disparar régua de cobrança automática (vencendo hoje + atrasadas nos dias 2,3,5,10,20)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Iniciando régua de cobrança diária (08h00)...');
    try {
      const stats = await billingService.processDailyBilling();
      console.log(`[CRON] Régua de cobrança concluída: ${stats.success} enviadas, ${stats.failed} falhas.`);
    } catch (error: any) {
      console.error('[CRON] Erro ao processar régua de cobrança:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 11h00: Enviar resumo diário (lê do banco — não depende de estado em memória)
  cron.schedule('0 11 * * *', async () => {
    console.log('[CRON] Iniciando envio do resumo diário (11h00)...');
    try {
      await billingService.sendDailySummary();
      console.log('[CRON] Resumo diário enviado com sucesso.');
    } catch (error: any) {
      console.error('[CRON] Erro ao enviar resumo diário:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 02h00: Backup diário do banco de dados (Simulação)
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Iniciando backup diário (02h00)...');
    console.log('[CRON] Backup concluído.');
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 00h30 do dia 1 de cada mês: gerar contas a pagar do mês a partir das recorrências
  cron.schedule('30 0 1 * *', async () => {
    console.log('[CRON] Gerando contas a pagar mensais (dia 1, 00h30)...');
    try {
      const result = await payableService.generateMonthlyPayables();
      console.log(`[CRON] Contas a pagar geradas: ${result.created} conta(s).`);
    } catch (error: any) {
      console.error('[CRON] Erro ao gerar contas a pagar:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 08h30: Enviar alerta de contas a pagar vencidas ou vencendo em 3 dias para Celita
  cron.schedule('30 8 * * *', async () => {
    console.log('[CRON] Enviando alerta de contas a pagar (08h30)...');
    try {
      await payableService.sendPayablesAlert();
    } catch (error: any) {
      console.error('[CRON] Erro ao enviar alerta de contas a pagar:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 00h00 do dia 1 de cada mês: resetar tag "Pago" → "none" em todas as conversas
  cron.schedule('0 0 1 * *', async () => {
    console.log('[CRON] Resetando tags "Pago" para "none" (dia 1 do mês)...');
    try {
      const result = await db.execute(sql`
        UPDATE conversations
        SET tag = 'none', updated_at = CURRENT_TIMESTAMP
        WHERE tag = 'Pago'
      `);
      const affected = (result as any)[0]?.affectedRows ?? 0;
      console.log(`[CRON] Reset concluído: ${affected} conversa(s) resetada(s).`);
    } catch (error: any) {
      console.error('[CRON] Erro ao resetar tags Pago:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });
}
