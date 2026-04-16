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
    const { customerId, paymentMethod, items, installmentsCount, saleDate, firstDueDate, downPayment, downPaymentDate, customInstallments } = data;

    console.log('[sale.register] firstDueDate recebido:', firstDueDate);
    console.log('[sale.register] downPayment recebido:', downPayment);
    console.log('[sale.register] downPaymentDate recebido:', downPaymentDate);

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

        // Parcela de entrada (número 0) — registrada como paga na data informada
        if (downPayment && downPayment > 0) {
          const entryDate = downPaymentDate ? new Date(downPaymentDate) : new Date(saleDate || Date.now());
          installmentsData.push({
            saleId,
            customerId,
            installmentNumber: 0,
            dueDate: entryDate,
            originalAmount: downPayment.toFixed(2),
            paidAmount: downPayment.toFixed(2),
            paymentDate: entryDate,
            status: 'paid',
          });
        }

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
          // Gerar parcelas automáticas usando firstDueDate como base
          // Parcela 1 = firstDueDate, parcela 2 = firstDueDate + 1 mês, etc.
          const baseDate = firstDueDate
            ? new Date(firstDueDate)
            : addMonths(new Date(saleDate || Date.now()), 1);
          const amountToFinance = downPayment && downPayment > 0
            ? totalAmount - downPayment
            : totalAmount;
          const installmentValue = (amountToFinance / installmentsCount).toFixed(2);

          for (let i = 0; i < installmentsCount; i++) {
            installmentsData.push({
              saleId,
              customerId,
              installmentNumber: i + 1,
              dueDate: addMonths(baseDate, i),
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

  async listWithFilters(filters: any) {
    const { page = 1, limit = 10, customerId, paymentMethod, startDate, endDate, search } = filters;
    return saleRepository.listWithFilters({
      page,
      limit,
      customerId,
      paymentMethod,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
    });
  }

  async cancel(saleId: string) {
    return await db.transaction(async (tx) => {
      // 1. Buscar a venda
      const sale = await saleRepository.findById(saleId);
      if (!sale) {
        throw new AppError('Venda não encontrada', 404);
      }

      if (sale.deletedAt) {
        throw new AppError('Esta venda já foi cancelada', 400);
      }

      // 2. Reverter estoque dos produtos
      const saleItems = sale.items || [];
      for (const item of saleItems) {
        const product = await productRepository.findByIdForUpdate(tx, item.productId);
        if (product) {
          const newQuantity = product.quantity + item.quantity;
          await productRepository.updateStock(tx, product.id, newQuantity);

          // Atualizar estoque no Google Sheets
          if (product.sku) {
            await googleSheetsService.updateStockInSheet(product.sku, newQuantity);
          }
        }
      }

      // 3. Cancelar e ocultar as parcelas do crediário (bulk — independente do findById)
      await saleRepository.softDeleteInstallmentsBySaleId(tx, saleId);

      // 4. Soft delete da venda
      await saleRepository.softDelete(tx, saleId);

      return { message: 'Venda cancelada com sucesso', saleId };
    });
  }

  async getTotalSales() {
    return saleRepository.getTotalSales();
  }

  async getSalesLast7Days() {
    return saleRepository.getSalesLast7Days();
  }

  async getTopProductsThisMonth() {
    return saleRepository.getTopProductsThisMonth();
  }
}
