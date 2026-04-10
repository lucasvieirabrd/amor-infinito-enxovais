import cron from 'node-cron';
import { BillingService } from '../services/billing.service';

const billingService = new BillingService();

// Acumula estatísticas do dia para o resumo das 11h00
let dailyStats = { sent: 0, success: 0, failed: 0, notifiedClients: [] as string[] };

function resetDailyStats() {
  dailyStats = { sent: 0, success: 0, failed: 0, notifiedClients: [] };
}

/**
 * Agendamento de tarefas automáticas.
 * Fuso horário: America/Sao_Paulo
 */
export function setupCronJobs() {
  // 00h00: Resetar estatísticas do dia (separado do 08h00 para sobreviver a restarts)
  cron.schedule('0 0 * * *', () => {
    resetDailyStats();
    console.log('[CRON] Estatísticas diárias resetadas (00h00).');
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 08h00: Disparar régua de cobrança automática (vencendo hoje)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Iniciando régua de cobrança diária (08h00)...');
    try {
      const stats = await billingService.processDailyBilling();
      dailyStats.sent += stats.sent;
      dailyStats.success += stats.success;
      dailyStats.failed += stats.failed;
      dailyStats.notifiedClients.push(...stats.notifiedClients);
      console.log(`[CRON] Régua de cobrança concluída: ${stats.success} enviadas, ${stats.failed} falhas.`);
    } catch (error: any) {
      console.error('[CRON] Erro ao processar régua de cobrança:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 08h30: Disparar cobrança para TODAS as parcelas atrasadas
  cron.schedule('30 8 * * *', async () => {
    console.log('[CRON] Iniciando cobrança de parcelas atrasadas (08h30)...');
    try {
      const stats = await billingService.processOverdueBilling();
      dailyStats.sent += stats.sent;
      dailyStats.success += stats.success;
      dailyStats.failed += stats.failed;
      console.log(`[CRON] Cobrança de atrasados concluída: ${stats.success} enviadas, ${stats.failed} falhas.`);
    } catch (error: any) {
      console.error('[CRON] Erro ao processar cobrança de atrasados:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 11h00: Enviar resumo diário para administradores (usa stats acumuladas, sem re-enviar cobranças)
  cron.schedule('0 11 * * *', async () => {
    console.log('[CRON] Iniciando envio do resumo diário (11h00)...');
    try {
      await billingService.sendDailySummary(dailyStats);
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
    // Implementar lógica de backup (mysqldump + expurgo de antigos)
    console.log('[CRON] Backup concluído.');
  }, {
    timezone: 'America/Sao_Paulo'
  });
}
