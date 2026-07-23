import { parseDanfePDF } from '../utils/danfe';
import { NfImportRepository } from '../repositories/nf-import.repository';
import { ProductRepository } from '../repositories/product.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { db } from '../database';
import { products } from '../database/schema';
import { eq, sql } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';

const nfImportRepository = new NfImportRepository();
const productRepository = new ProductRepository();
const googleSheetsService = new GoogleSheetsService();

export interface ConfirmItem {
  supplierCode: string;
  supplierDescription: string;
  ncm: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  action: 'link' | 'new' | 'ignore';
  productId: string | null;
  newProductName: string | null;
}

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
    const suggestions = await nfImportRepository.getSuggestionsForCodes(result.supplierCnpj, codes);

    const itemsWithSuggestions = result.items.map(item => ({
      ...item,
      suggestedProductId: suggestions.get(item.code) ?? null,
    }));

    // Check for duplicate import by access key
    let duplicateImport: { id: string; createdAt: Date } | null = null;
    if (result.accessKey) {
      const existing = await nfImportRepository.findByAccessKey(result.accessKey);
      if (existing && existing.status === 'confirmed') {
        duplicateImport = { id: existing.id, createdAt: existing.createdAt };
      }
    }

    return { ...result, itemsWithSuggestions, duplicateImport };
  }

  async confirm(data: {
    filename: string;
    accessKey: string | null;
    nfNumber: string | null;
    nfSeries: string | null;
    supplierCnpj: string | null;
    supplierName: string | null;
    nfDate: string | null;
    totalProducts: number | null;
    reimport: boolean;
    importedBy: string;
    items: ConfirmItem[];
  }) {
    // Block duplicate import unless user explicitly acknowledged it
    if (data.accessKey && !data.reimport) {
      const existing = await nfImportRepository.findByAccessKey(data.accessKey);
      if (existing && existing.status === 'confirmed') {
        throw new AppError(
          `Esta nota já foi importada em ${new Date(existing.createdAt).toLocaleDateString('pt-BR')}. Marque a opção de reimportar para continuar.`,
          409,
        );
      }
    }

    const updatedProducts: Array<{ productId: string; productName: string; addedQty: number; newQty: number; newCost: number }> = [];
    const newProducts: Array<{ productId: string; productName: string; sku: string; quantity: number }> = [];

    const itemsForRecord: Parameters<typeof nfImportRepository.createImport>[0]['items'] = [];

    for (const item of data.items) {
      if (item.action === 'ignore') {
        itemsForRecord.push({ ...item, productId: null, wasNew: false });
        continue;
      }

      if (item.action === 'link' && item.productId) {
        const product = await productRepository.findById(item.productId);
        if (!product) continue;

        const addedQty = Math.round(item.quantity);
        const newQty = product.quantity + addedQty;

        // Quantity is ALWAYS summed, never replaced
        await db.update(products).set({
          quantity: newQty,
          cost: item.unitCost.toFixed(2),
          updatedAt: new Date(),
        }).where(eq(products.id, item.productId));

        if (data.supplierCnpj) {
          await nfImportRepository.upsertSupplierMap(data.supplierCnpj, item.supplierCode, item.supplierDescription, item.productId);
        }

        if (product.sku) {
          await googleSheetsService.updateStockInSheet(product.sku, newQty);
        }

        updatedProducts.push({ productId: item.productId, productName: product.name, addedQty, newQty, newCost: item.unitCost });
        itemsForRecord.push({ ...item, productId: item.productId, wasNew: false });
        continue;
      }

      if (item.action === 'new' && item.newProductName) {
        const sku = await this.getNextSku();
        const newProductId = uuidv4();
        const addedQty = Math.round(item.quantity);

        await db.insert(products).values({
          id: newProductId,
          name: item.newProductName,
          sku,
          quantity: addedQty,
          cost: item.unitCost.toFixed(2),
          price: '0.00',
          minStockLevel: 0,
        });

        if (data.supplierCnpj) {
          await nfImportRepository.upsertSupplierMap(data.supplierCnpj, item.supplierCode, item.supplierDescription, newProductId);
        }

        await googleSheetsService.addProductToSheet({
          sku,
          name: item.newProductName,
          category: '',
          description: '',
          specifications: '',
          imageUrl: '',
          price: 0,
          quantity: addedQty,
        });

        newProducts.push({ productId: newProductId, productName: item.newProductName, sku, quantity: addedQty });
        itemsForRecord.push({ ...item, productId: newProductId, wasNew: true });
        continue;
      }

      // Fallback: record without product link
      itemsForRecord.push({ ...item, productId: null, wasNew: false });
    }

    const nfImportId = await nfImportRepository.createImport({
      filename: data.filename,
      accessKey: data.accessKey,
      nfNumber: data.nfNumber,
      nfSeries: data.nfSeries,
      supplierCnpj: data.supplierCnpj,
      supplierName: data.supplierName,
      nfDate: data.nfDate,
      totalProducts: data.totalProducts,
      importedBy: data.importedBy,
      items: itemsForRecord,
    });

    const skippedCount = data.items.filter(i => i.action === 'ignore').length;

    return { nfImportId, updatedProducts, newProducts, skippedCount };
  }

  async list(page: number, limit: number) {
    return nfImportRepository.listImports(page, limit);
  }

  private async getNextSku(): Promise<string> {
    const result = await db.execute(sql`
      SELECT sku FROM products
      WHERE sku REGEXP '^MOV[0-9]+$' AND deleted_at IS NULL
      ORDER BY CAST(SUBSTRING(sku, 4) AS UNSIGNED) DESC
      LIMIT 1
    `);
    const rows = result[0] as any[];
    if (rows.length === 0) return 'MOV0001';
    const lastNum = parseInt((rows[0].sku as string).replace(/^MOV/, ''), 10);
    return `MOV${String(lastNum + 1).padStart(4, '0')}`;
  }
}
