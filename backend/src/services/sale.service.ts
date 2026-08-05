import { db } from '../database';
import { auditLogs, products as productsTable } from '../database/schema';
import { SaleRepository } from '../repositories/sale.repository';
import { ProductRepository } from '../repositories/product.repository';
import { KitRepository } from '../repositories/kit.repository';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';
import { addMonths } from 'date-fns';
import { and, inArray, isNull } from 'drizzle-orm';

const saleRepository = new SaleRepository();
const productRepository = new ProductRepository();
const kitRepository = new KitRepository();
const deliveryRepository = new DeliveryRepository();
const googleSheetsService = new GoogleSheetsService();

export class SaleService {
  async register(data: any, userId: string) {
    const { customerId, paymentMethod, items, installmentsCount, saleDate, firstDueDate, downPayment, downPaymentDate, customInstallments, sellerId } = data;

    console.log('[sale.register] firstDueDate recebido:', firstDueDate);
    console.log('[sale.register] downPayment recebido:', downPayment);
    console.log('[sale.register] downPaymentDate recebido:', downPaymentDate);

    // Pre-load all products to detect kits before entering the transaction
    const allProductIds = [...new Set(items.map((i: any) => i.productId as string))];
    const productInfos = await db
      .select()
      .from(productsTable)
      .where(and(inArray(productsTable.id, allProductIds), isNull(productsTable.deletedAt)));
    const productMap = new Map(productInfos.map(p => [p.id, p]));

    // Batch-load kit components for kit products
    const kitProductIds = productInfos.filter(p => p.isKit).map(p => p.id);
    const allComponents = kitProductIds.length > 0
      ? await kitRepository.findComponentsByKitIds(kitProductIds)
      : [];
    const compsByKitId = new Map<string, typeof allComponents>();
    for (const c of allComponents) {
      if (!compsByKitId.has(c.kitProductId)) compsByKitId.set(c.kitProductId, []);
      compsByKitId.get(c.kitProductId)!.push(c);
    }

    // Aggregate component needs: Map<componentProductId, totalQtyNeeded>
    const componentNeeds = new Map<string, number>();
    for (const item of items) {
      const productInfo = productMap.get(item.productId);
      if (!productInfo?.isKit) continue;
      const comps = compsByKitId.get(item.productId) ?? [];
      for (const comp of comps) {
        componentNeeds.set(
          comp.componentProductId,
          (componentNeeds.get(comp.componentProductId) ?? 0) + comp.quantity * item.quantity,
        );
      }
    }

    let hasFurniture = false;

    const result = await db.transaction(async (tx) => {
      let totalAmount = 0;
      // Map productId → catalog price for audit logging
      const catalogPrices: Record<string, number> = {};

      // 1. Não-kits — lock pessimista + decremento de estoque próprio
      for (const item of items) {
        const productInfo = productMap.get(item.productId);
        if (productInfo?.isKit) continue;

        const product = await productRepository.findByIdForUpdate(tx, item.productId);
        if (!product) {
          throw new AppError(`Produto com ID ${item.productId} não encontrado`, 404);
        }

        if (product.quantity < item.quantity) {
          throw new AppError(`Estoque insuficiente para o produto ${product.name}`, 400);
        }

        if (product.category === 'Móveis') hasFurniture = true;

        catalogPrices[item.productId] = parseFloat(product.price.toString());

        const newQuantity = product.quantity - item.quantity;
        await productRepository.updateStock(tx, product.id, newQuantity);

        if (product.sku) {
          await googleSheetsService.updateStockInSheet(product.sku, newQuantity);
        }

        totalAmount += item.unitPrice * item.quantity;
      }

      // 2. Kits — preço de catálogo computado a partir dos componentes, sem estoque próprio
      for (const item of items) {
        const productInfo = productMap.get(item.productId);
        if (!productInfo?.isKit) continue;

        if (productInfo.category === 'Móveis') hasFurniture = true;

        const comps = compsByKitId.get(item.productId) ?? [];
        const computedPrice = comps.reduce((sum, c) => {
          const p = typeof c.componentPrice === 'string' ? parseFloat(c.componentPrice) : (c.componentPrice as number);
          return sum + p * c.quantity;
        }, 0);
        catalogPrices[item.productId] = computedPrice;
        totalAmount += item.unitPrice * item.quantity;
      }

      // 3. Decremento dos componentes — FOR UPDATE por componente único
      for (const [componentId, totalQty] of componentNeeds) {
        const component = await productRepository.findByIdForUpdate(tx, componentId);
        if (!component) {
          throw new AppError(`Componente do kit não encontrado (ID: ${componentId})`, 404);
        }
        if (component.quantity < totalQty) {
          throw new AppError(
            `Estoque insuficiente do componente "${component.name}" para atender aos kits (disponível: ${component.quantity}, necessário: ${totalQty})`,
            400,
          );
        }
        const newQuantity = component.quantity - totalQty;
        await productRepository.updateStock(tx, component.id, newQuantity);
        if (component.sku) {
          await googleSheetsService.updateStockInSheet(component.sku, newQuantity);
        }
      }

      // 2. Criar a venda
      const saleData = {
        customerId,
        userId,
        sellerId: sellerId ?? null,
        paymentMethod,
        totalAmount: totalAmount.toFixed(2),
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        installmentsCount: paymentMethod === 'cash' ? null : installmentsCount,
      };

      const { id: saleId, saleNumber } = await saleRepository.createSale(tx, saleData);

      // 3. Criar os itens da venda com o preço editado e o preço original do catálogo
      const saleItemsData = items.map((item: any) => ({
        saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        originalUnitPrice: catalogPrices[item.productId].toFixed(2),
        totalPrice: (item.unitPrice * item.quantity).toFixed(2),
      }));

      await saleRepository.createSaleItems(tx, saleItemsData);

      // 4. Registrar audit log para cada item com preço alterado
      for (const item of items) {
        const catalogPrice = catalogPrices[item.productId];
        if (Math.abs(item.unitPrice - catalogPrice) > 0.001) {
          await tx.insert(auditLogs).values({
            id: uuidv4(),
            userId,
            action: 'PRICE_OVERRIDE_SALE',
            entityType: 'SaleItem',
            entityId: saleId,
            oldValue: { productId: item.productId, catalogPrice },
            newValue: { unitPrice: item.unitPrice, saleNumber },
          });
        }
      }

      // 4. Se for crediário, gerar as parcelas
      if (paymentMethod === 'installment') {
        const installmentsData = [];

        // Parcela de entrada (número 0) — registrada como paga na data informada
        if (downPayment && downPayment > 0) {
          // T12:00:00 evita que meia-noite UTC seja interpretada como dia anterior em UTC-3
          const entryDate = downPaymentDate
            ? new Date(downPaymentDate + 'T12:00:00')
            : new Date(saleDate || Date.now());
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
            // T12:00:00 evita regressão de 1 dia por timezone UTC-3
            installmentsData.push({
              saleId,
              customerId,
              installmentNumber: i + 1,
              dueDate: new Date(inst.dueDate + 'T12:00:00'),
              originalAmount: inst.amount.toFixed(2),
              status: 'pending',
            });
          }
        } else {
          // Gerar parcelas automáticas usando firstDueDate como base
          // Parcela 1 = firstDueDate, parcela 2 = firstDueDate + 1 mês, etc.
          // T12:00:00 garante que addMonths preserve o dia correto em UTC-3
          const baseDate = firstDueDate
            ? new Date(firstDueDate + 'T12:00:00')
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

    if (hasFurniture) {
      try {
        await deliveryRepository.create({ saleId: result.saleId, customerId });
      } catch (err: any) {
        console.error('[sale] Erro ao criar entrega automática:', err?.message);
      }
    }

    return result;
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
    const { page = 1, limit = 10, customerId, paymentMethod, startDate, endDate, search, origin, sellerId } = filters;
    return saleRepository.listWithFilters({
      page,
      limit,
      customerId,
      paymentMethod,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      origin,
      sellerId,
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

      // 2. Reverter estoque dos produtos (incluindo componentes de kits)
      const saleItems = sale.items || [];

      // Pre-load product infos to detect kits
      const cancelProductIds = [...new Set(saleItems.map((i: any) => i.productId as string))];
      const cancelProductInfos = cancelProductIds.length > 0
        ? await db.select().from(productsTable).where(inArray(productsTable.id, cancelProductIds))
        : [];
      const cancelProductMap = new Map(cancelProductInfos.map(p => [p.id, p]));

      const cancelKitProductIds = cancelProductInfos.filter(p => p.isKit).map(p => p.id);
      const cancelAllComponents = cancelKitProductIds.length > 0
        ? await kitRepository.findComponentsByKitIds(cancelKitProductIds)
        : [];
      const cancelCompsByKitId = new Map<string, typeof cancelAllComponents>();
      for (const c of cancelAllComponents) {
        if (!cancelCompsByKitId.has(c.kitProductId)) cancelCompsByKitId.set(c.kitProductId, []);
        cancelCompsByKitId.get(c.kitProductId)!.push(c);
      }

      // Aggregate component restorations
      const componentRestorations = new Map<string, number>();
      for (const item of saleItems) {
        const productInfo = cancelProductMap.get(item.productId);
        if (!productInfo?.isKit) continue;
        const comps = cancelCompsByKitId.get(item.productId) ?? [];
        for (const comp of comps) {
          componentRestorations.set(
            comp.componentProductId,
            (componentRestorations.get(comp.componentProductId) ?? 0) + comp.quantity * item.quantity,
          );
        }
      }

      // Restore non-kit product stocks
      for (const item of saleItems) {
        const productInfo = cancelProductMap.get(item.productId);
        if (productInfo?.isKit) continue;

        const product = await productRepository.findByIdForUpdate(tx, item.productId);
        if (product) {
          const newQuantity = product.quantity + item.quantity;
          await productRepository.updateStock(tx, product.id, newQuantity);
          if (product.sku) {
            await googleSheetsService.updateStockInSheet(product.sku, newQuantity);
          }
        }
      }

      // Restore component stocks for kit items
      for (const [componentId, restoreQty] of componentRestorations) {
        const component = await productRepository.findByIdForUpdate(tx, componentId);
        if (component) {
          const newQuantity = component.quantity + restoreQty;
          await productRepository.updateStock(tx, component.id, newQuantity);
          if (component.sku) {
            await googleSheetsService.updateStockInSheet(component.sku, newQuantity);
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
