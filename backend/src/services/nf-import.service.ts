import { parseDanfePDF } from '../utils/danfe';
import { NfImportRepository } from '../repositories/nf-import.repository';
import { ProductRepository } from '../repositories/product.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { db } from '../database';
import { products } from '../database/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';

const nfImportRepository = new NfImportRepository();
const productRepository = new ProductRepository();
const googleSheetsService = new GoogleSheetsService();

export class NfImportService {
  async parse(buffer: Buffer) {
    const result = await parseDanfePDF(buffer);

    if (result.items.length === 0) {
      throw new AppError(
        'Nenhum item encontrado no PDF. Verifique se é um DANFE válido e se o arquivo não está protegido.',
        422,
      );
    }

    const codes = result.items.map(i => i.code);
    const suggestions = await nfImportRepository.getSuggestionsForCodes(codes);

    const itemsWithSuggestions = result.items.map(item => ({
      ...item,
      suggestedProductId: suggestions.get(item.code) ?? null,
    }));

    return { ...result, itemsWithSuggestions };
  }

  async confirm(data: {
    filename: string;
    nfNumber: string | null;
    supplierName: string | null;
    nfDate: string | null;
    totalProducts: number | null;
    importedBy: string;
    items: Array<{
      supplierCode: string;
      supplierDescription: string;
      ncm: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
      productId: string | null;
    }>;
  }) {
    const mappedItems = data.items.filter(i => i.productId);
    const updatedProducts: Array<{
      productId: string;
      productName: string;
      addedQty: number;
      newQty: number;
      newCost: number;
    }> = [];

    for (const item of mappedItems) {
      const product = await productRepository.findById(item.productId!);
      if (!product) continue;

      const addedQty = Math.round(item.quantity);
      const newQty = product.quantity + addedQty;

      await db
        .update(products)
        .set({
          quantity: newQty,
          cost: item.unitCost.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId!));

      await nfImportRepository.upsertSupplierMap(item.supplierCode, item.productId!);

      if (product.sku) {
        await googleSheetsService.updateStockInSheet(product.sku, newQty);
      }

      updatedProducts.push({
        productId: item.productId!,
        productName: product.name,
        addedQty,
        newQty,
        newCost: item.unitCost,
      });
    }

    const nfImportId = await nfImportRepository.createImport(data);

    return {
      nfImportId,
      updatedProducts,
      skippedCount: data.items.length - mappedItems.length,
    };
  }

  async list(page: number, limit: number) {
    return nfImportRepository.listImports(page, limit);
  }
}
