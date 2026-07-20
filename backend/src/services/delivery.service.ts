import { DeliveryRepository } from '../repositories/delivery.repository';
import { MessageRepository } from '../repositories/message.repository';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { AppError } from '../utils/AppError';

const deliveryRepository = new DeliveryRepository();
const messageRepository = new MessageRepository();
const whatsAppService = new WhatsAppService();

const MARCELO_PHONE = '5516981271021';

export class DeliveryService {
  async list(params: { status?: 'pending' | 'delivered'; search?: string; page?: number; limit?: number }) {
    return deliveryRepository.list({
      status: params.status ?? 'pending',
      search: params.search,
      page: params.page ?? 1,
      limit: params.limit ?? 12,
    });
  }

  async deliver(id: string, data: { deliveryType: 'com_montagem' | 'sem_montagem'; deliveredBy: string }) {
    const delivery = await deliveryRepository.findById(id);
    if (!delivery) throw new AppError('Entrega não encontrada', 404);
    if (delivery.status === 'delivered') throw new AppError('Esta entrega já foi concluída', 400);

    await deliveryRepository.deliver(id, data);

    if (data.deliveryType === 'com_montagem') {
      try {
        const addressParts = [
          delivery.addressStreet,
          delivery.addressNumber,
          delivery.addressComplement,
          delivery.addressNeighborhood,
          delivery.addressCity,
        ].filter(Boolean);
        const addressLine = addressParts.join(', ') || 'Endereço não informado';

        const itemsList = delivery.items
          .map(i => {
            const desc = i.productDescription ? ` — ${i.productDescription}` : '';
            return `  ${i.quantity}x ${i.productName}${desc}`;
          })
          .join('\n');

        const text =
          `🚚 Nova entrega para o montador!\n\n` +
          `Cliente: ${delivery.customerName}\n` +
          `Telefone: ${delivery.customerPhone}\n` +
          `Endereço: ${addressLine}\n\n` +
          `Itens:\n${itemsList}\n\n` +
          `Tipo: Com montagem\n` +
          `Venda: ${delivery.saleNumber}`;

        const result = await whatsAppService.sendTextMessage(MARCELO_PHONE, text);

        await messageRepository.create({
          metaMessageId: result?.messages?.[0]?.id,
          customerId: delivery.customerId,
          fromPhone: 'SISTEMA',
          toPhone: MARCELO_PHONE,
          type: 'text',
          content: text,
          direction: 'outbound',
          status: result?.error ? 'failed' : 'sent',
          tag: 'none',
          errorMessage: result?.error ? String(result.message ?? '') : null,
          timestamp: new Date(),
        });
      } catch (err: any) {
        console.error('[delivery] Erro ao notificar Marcelo via WhatsApp:', err?.message);
      }
    }

    return { message: 'Entrega registrada com sucesso' };
  }
}
