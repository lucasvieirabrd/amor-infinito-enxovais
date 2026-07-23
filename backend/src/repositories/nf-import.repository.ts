import { db } from '../database';
import { nfImports, nfImportItems, supplierProductMap } from '../database/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class NfImportRepository {
  async findByAccessKey(accessKey: string) {
    const result = await db
      .select()
      .from(nfImports)
      .where(eq(nfImports.accessKey, accessKey))
      .limit(1);
    return result[0] ?? null;
  }

  /** Look up known mappings for (CNPJ, codes[]) — returns code→productId map. */
  async getSuggestionsForCodes(cnpj: string | null, codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0 || !cnpj) return new Map();
    const rows = await db
      .select({ supplierCode: supplierProductMap.supplierCode, productId: supplierProductMap.productId })
      .from(supplierProductMap)
      .where(and(
        eq(supplierProductMap.supplierCnpj, cnpj),
        inArray(supplierProductMap.supplierCode, codes),
      ));
    return new Map(rows.map(r => [r.supplierCode, r.productId]));
  }

  /** Upsert de-para: (CNPJ+code) → productId. Unique key is (supplier_cnpj, supplier_code). */
  async upsertSupplierMap(supplierCnpj: string, supplierCode: string, supplierDescription: string, productId: string) {
    await db.execute(sql`
      INSERT INTO supplier_product_map (id, supplier_cnpj, supplier_code, supplier_description, product_id)
      VALUES (${uuidv4()}, ${supplierCnpj}, ${supplierCode}, ${supplierDescription}, ${productId})
      ON DUPLICATE KEY UPDATE
        product_id           = ${productId},
        supplier_description = ${supplierDescription},
        updated_at           = NOW()
    `);
  }

  async createImport(data: {
    filename: string;
    accessKey: string | null;
    nfNumber: string | null;
    nfSeries: string | null;
    supplierCnpj: string | null;
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
      wasNew: boolean;
    }>;
  }): Promise<string> {
    const id = uuidv4();
    await db.insert(nfImports).values({
      id,
      filename: data.filename,
      accessKey: data.accessKey,
      nfNumber: data.nfNumber,
      nfSeries: data.nfSeries,
      supplierCnpj: data.supplierCnpj,
      supplierName: data.supplierName,
      nfDate: data.nfDate,
      totalProducts: data.totalProducts?.toFixed(2) ?? null,
      status: 'confirmed',
      importedBy: data.importedBy,
    });

    for (const item of data.items) {
      await db.insert(nfImportItems).values({
        id: uuidv4(),
        nfImportId: id,
        supplierCode: item.supplierCode,
        supplierDescription: item.supplierDescription,
        ncm: item.ncm,
        quantity: item.quantity.toFixed(4),
        unitCost: item.unitCost.toFixed(4),
        totalCost: item.totalCost.toFixed(2),
        productId: item.productId,
        wasNew: item.wasNew ? 1 : 0,
      });
    }

    return id;
  }

  async listImports(page: number, limit: number) {
    const offset = (page - 1) * limit;
    return db
      .select()
      .from(nfImports)
      .orderBy(desc(nfImports.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
