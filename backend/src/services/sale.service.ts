import { db } from '../database';
import { SaleRepository } from '../repositories/sale.repository';
import { ProductRepository } from '../repositories/product.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';
import { addMonths } from 'date-fns';

const saleRepository = new SaleRepository();
const productRepository = new ProductRepository();
const googleSheetsService = new GoogleSheetsService();

export class SaleService {
  async register(data: any, userId: string) {
    const { customerId, paymentMethod, items, installmentsCount, saleDate, customInstallments } = data;

    // Inicia transação de banco de dados
    return await db.transaction(async (tx) => {
      let totalAmount = 0;

      // 1. Validar e reservar estoque (Lock Pessimista)
      for (const item of items) {
        const product = await productRepository.findByIdForUpdate(tx, item.productId);
        if (!product) {
          throw new AppError(`Produto com ID ${item.productId} não encontrado`, 404);
        }

        if (product.quantity < item.quantity) {
          throw new AppError(`Estoque insuficiente para o produto ${product.name}`, 400);
        }

        // Decrementar estoque local
        const newQuantity = product.quantity - item.quantity;
        await productRepository.updateStock(tx, product.id, newQuantity);

        // Atualizar estoque no Google Sheets (Sincronização)
        if (product.sku) {
          await googleSheetsService.updateStockInSheet(product.sku, newQuantity);
        }

        totalAmount += parseFloat(product.price.toString()) * item.quantity;
      }

      // 2. Criar a venda
      const saleData = {
        customerId,
        userId,
        paymentMethod,
        totalAmount: totalAmount.toFixed(2),
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        installmentsCount: paymentMethod === 'cash' ? null : installmentsCount,
      };

      const { id: saleId, saleNumber } = await saleRepository.createSale(tx, saleData);

      // 3. Criar os itens da venda
      const saleItemsData = items.map((item: any) => {
        // Recalcula o preço total do item para garantir integridade
        // (idealmente buscaríamos o preço do produto novamente aqui)
        return {
          saleId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          totalPrice: (item.unitPrice * item.quantity).toFixed(2),
        };
      });

      await saleRepository.createSaleItems(tx, saleItemsData);

      // 4. Se for crediário, gerar as parcelas
      if (paymentMethod === 'installment') {
        const installmentsData = [];

        if (customInstallments && customInstallments.length > 0) {
          // Parcelas personalizadas enviadas pelo frontend
          for (let i = 0; i < customInstallments.length; i++) {
            const inst = customInstallments[i];
            installmentsData.push({
              saleId,
              customerId,
              installmentNumber: i + 1,
              dueDate: new Date(inst.dueDate),
              originalAmount: inst.amount.toFixed(2),
              status: 'pending',
            });
          }
        } else {
          // Gerar parcelas automáticas se não houver personalização
          const installmentValue = (totalAmount / installmentsCount).toFixed(2);
          for (let i = 1; i <= installmentsCount; i++) {
            installmentsData.push({
              saleId,
              customerId,
              installmentNumber: i,
              dueDate: addMonths(new Date(saleDate || Date.now()), i),
              originalAmount: installmentValue,
              status: 'pending',
            });
          }
        }

        await saleRepository.createInstallments(tx, installmentsData);
      }

      return { saleId, saleNumber, totalAmount };
    });
  }

  async list(page = 1, limit = 10) {
    return saleRepository.list(page, limit);
  }

  async getById(id: string) {
    const sale = await saleRepository.findById(id);
    if (!sale) {
      throw new AppError('Venda não encontrada', 404);
    }
    return sale;
  }
}
