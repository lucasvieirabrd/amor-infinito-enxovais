import { db } from '../database';
import { nfImports, nfImportItems, supplierProductMap } from '../database/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class NfImportRepository {
  async getSuggestionsForCodes(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await db
      .select({ supplierCode: supplierProductMap.supplierCode, productId: supplierProductMap.productId })
      .from(supplierProductMap)
      .where(inArray(supplierProductMap.supplierCode, codes));
    return new Map(rows.map(r => [r.supplierCode, r.productId]));
  }

  async upsertSupplierMap(supplierCode: string, productId: string) {
    await db.execute(sql`
      INSERT INTO supplier_product_map (id, supplier_code, product_id)
      VALUES (${uuidv4()}, ${supplierCode}, ${productId})
      ON DUPLICATE KEY UPDATE product_id = ${productId}, updated_at = NOW()
    `);
  }

  async createImport(data: {
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
  }): Promise<string> {
    const id = uuidv4();
    await db.insert(nfImports).values({
      id,
      filename: data.filename,
      nfNumber: data.nfNumber,
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
