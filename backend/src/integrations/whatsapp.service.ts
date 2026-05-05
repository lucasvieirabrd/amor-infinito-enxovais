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

  /**
   * Faz upload de um arquivo binário para a WhatsApp Media API.
   * Retorna o media_id que pode ser reutilizado para múltiplos envios.
   */
  async uploadMedia(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const response = await fetch(`${this.apiUrl}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`WhatsApp media upload falhou: ${JSON.stringify(errData)}`);
    }

    const data = await response.json() as any;
    console.log('[WhatsApp] uploadMedia ✓ mediaId:', data.id);
    return data.id;
  }

  /**
   * Resolve a URL de uma mídia recebida pelo webhook e retorna o buffer binário.
   * Usado pelo proxy endpoint para servir imagens, áudios, vídeos e documentos ao frontend.
   */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.token) {
      throw new Error('[downloadMedia] WHATSAPP_API_TOKEN não configurado');
    }

    console.log(`[downloadMedia] step1 — GET graph.facebook.com/v19.0/${mediaId}`);

    let metaRes: any;
    try {
      metaRes = await axios.get(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
    } catch (err: any) {
      const detail = JSON.stringify(err.response?.data ?? err.message);
      console.error(`[downloadMedia] step1 ✗ status=${err.response?.status} detail=${detail}`);
      throw err;
    }

    const mediaUrl: string = metaRes.data.url;
    const mimeType: string = metaRes.data.mime_type || 'application/octet-stream';
    console.log(`[downloadMedia] step1 ✓ mimeType=${mimeType} url=${mediaUrl?.slice(0, 80)}...`);

    let dlRes: any;
    try {
      dlRes = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
        responseType: 'arraybuffer',
      });
    } catch (err: any) {
      const raw = err.response?.data;
      const detail = raw
        ? Buffer.isBuffer(raw)
          ? raw.toString('utf8').slice(0, 200)
          : raw instanceof ArrayBuffer
            ? new TextDecoder().decode(raw).slice(0, 200)
            : JSON.stringify(raw)
        : err.message;
      console.error(`[downloadMedia] step2 ✗ status=${err.response?.status} detail=${detail}`);
      throw err;
    }

    console.log(`[downloadMedia] step2 ✓ bytes=${dlRes.data.byteLength}`);
    return { buffer: Buffer.from(dlRes.data), mimeType };
  }

  /**
   * Envia um documento (PDF, etc.) via media_id obtido em uploadMedia.
   */
  async sendDocumentMessage(to: string, mediaId: string, filename: string, caption: string) {
    const cleanPhone = this.normalizePhone(to);
    try {
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'document',
          document: { id: mediaId, filename, caption },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`[WhatsApp] sendDocumentMessage ✓ para ${cleanPhone}`);
      return response.data;
    } catch (error: any) {
      console.error(`[WhatsApp] sendDocumentMessage ✗ para ${cleanPhone}:`, error.response?.data || error.message);
      return { error: true, message: error.message };
    }
  }
}
