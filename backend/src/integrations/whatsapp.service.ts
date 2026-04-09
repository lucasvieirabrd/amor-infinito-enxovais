import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class WhatsAppService {
  private token: string;
  private apiUrl: string;

  constructor() {
    this.token = process.env.WHATSAPP_API_TOKEN || '';
    this.apiUrl = process.env.WHATSAPP_API_URL || '';
  }

  /**
   * Envia uma mensagem baseada em template oficial.
   */
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  async sendTemplateMessage(to: string, templateName: string, components: any[]) {
    try {
      const cleanPhone = this.normalizePhone(to);
      
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'pt_BR' },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar template ${templateName} para ${to}:`, error.response?.data || error.message);
      // Não lançamos erro aqui para não interromper processos em lote, apenas registramos
      return { error: true, message: error.message };
    }
  }

  /**
   * Envia uma mensagem de texto simples (usada para respostas e relatórios).
   */
  async sendTextMessage(to: string, text: string) {
    const cleanPhone = this.normalizePhone(to);
    const url = `${this.apiUrl}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text },
    };

    console.log('[WhatsApp] sendTextMessage →', {
      url,
      body: JSON.stringify(body),
      tokenPrefix: this.token ? this.token.slice(0, 10) + '...' : '(vazio)',
    });

    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[WhatsApp] sendTextMessage ✓ status:', response.status, 'data:', JSON.stringify(response.data));
      return response.data;
    } catch (error: any) {
      console.error('[WhatsApp] sendTextMessage ✗ status:', error.response?.status);
      console.error('[WhatsApp] sendTextMessage ✗ error completo:', JSON.stringify(error.response?.data ?? error.message));
      return { error: true, message: error.message };
    }
  }
}
