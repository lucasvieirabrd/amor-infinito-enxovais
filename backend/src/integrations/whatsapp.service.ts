import axios from 'axios';
import { AppError } from '../utils/AppError';
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
  async sendTemplateMessage(to: string, templateName: string, components: any[]) {
    try {
      // Limpar o número de telefone (apenas dígitos)
      const cleanPhone = to.replace(/\D/g, '');
      
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
    try {
      const cleanPhone = to.replace(/\D/g, '');
      
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: text },
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
      console.error(`Erro ao enviar mensagem de texto para ${to}:`, error.response?.data || error.message);
      return { error: true, message: error.message };
    }
  }
}
