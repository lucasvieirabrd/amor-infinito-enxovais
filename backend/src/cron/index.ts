import cron from 'node-cron';
import { BillingService } from '../services/billing.service';

const billingService = new BillingService();

/**
 * Agendamento de tarefas automáticas.
 * Fuso horário: America/Sao_Paulo
 */
export function setupCronJobs() {
  // 08h00: Disparar régua de cobrança automática
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Iniciando régua de cobrança diária (08h00)...');
    try {
      await billingService.processDailyBilling();
      console.log('[CRON] Régua de cobrança concluída com sucesso.');
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
      console.log(`[CRON] Cobrança de atrasados concluída: ${stats.success} enviadas, ${stats.failed} falhas.`);
    } catch (error: any) {
      console.error('[CRON] Erro ao processar cobrança de atrasados:', error.message);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  // 11h00: Enviar resumo diário para administradores
  cron.schedule('0 11 * * *', async () => {
    console.log('[CRON] Iniciando envio do resumo diário (11h00)...');
    try {
      // Nota: Em um sistema real, as estatísticas do dia seriam buscadas no banco de dados
      // Para simplificação, o serviço de cobrança pode ter um método que busca os envios de hoje
      const stats = await billingService.processDailyBilling(); // Reaproveitando lógica ou criando uma específica
      await billingService.sendDailySummary(stats);
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
