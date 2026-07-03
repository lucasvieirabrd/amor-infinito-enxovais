import 'dotenv/config';
import { db } from '../database';
import { products } from '../database/schema';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { eq, and, isNull } from 'drizzle-orm';

async function main() {
  const googleSheetsService = new GoogleSheetsService();

  console.log('Buscando produtos da planilha...');
  const sheetProducts = await googleSheetsService.getProductsFromSheet();
  console.log(`${sheetProducts.length} produto(s) encontrado(s) na planilha.`);

  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  for (const sheetProduct of sheetProducts) {
    if (!sheetProduct.sku) {
      skipped++;
      continue;
    }

    const [local] = await db
      .select()
      .from(products)
      .where(and(eq(products.sku, sheetProduct.sku), isNull(products.deletedAt)))
      .limit(1);

    if (!local) {
      console.log(`  SKU não encontrado localmente: ${sheetProduct.sku}`);
      notFound++;
      continue;
    }

    const newCategory = sheetProduct.category || null;
    if (local.category === newCategory) {
      skipped++;
      continue;
    }

    await db
      .update(products)
      .set({ category: newCategory, updatedAt: new Date() })
      .where(eq(products.id, local.id));

    console.log(`  Atualizado: ${local.name} (${local.sku}) → categoria: ${newCategory ?? '(vazia)'}`);
    updated++;
  }

  console.log(`\nConcluído: ${updated} atualizado(s), ${notFound} não encontrado(s), ${skipped} sem alteração.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
