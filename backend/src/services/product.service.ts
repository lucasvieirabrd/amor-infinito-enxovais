import { ProductRepository } from '../repositories/product.repository';
import { KitRepository } from '../repositories/kit.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { AppError } from '../utils/AppError';
import { db } from '../database';
import { auditLogs } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

const productRepository = new ProductRepository();
const kitRepository = new KitRepository();
const googleSheetsService = new GoogleSheetsService();

export class ProductService {
  async register(data: any) {
    if (data.sku) {
      const productExists = await productRepository.findBySku(data.sku);
      if (productExists) {
        throw new AppError('Este SKU já está cadastrado para outro produto', 400);
      }
    }

    const product = await productRepository.create(data);

    if (!product) {
      throw new AppError('Erro ao cadastrar produto', 500);
    }

    await googleSheetsService.addProductToSheet(product);

    return product;
  }

  async list(page = 1, limit = 10, search?: string, category?: string) {
    const result = await productRepository.list(page, limit, search, category);

    const kitIds = result.data.filter(p => p.isKit).map(p => p.id);
    if (kitIds.length === 0) return result;

    const allComponents = await kitRepository.findComponentsByKitIds(kitIds);
    const compsByKitId = new Map<string, typeof allComponents>();
    for (const c of allComponents) {
      if (!compsByKitId.has(c.kitProductId)) compsByKitId.set(c.kitProductId, []);
      compsByKitId.get(c.kitProductId)!.push(c);
    }

    const enriched = result.data.map(p => {
      if (!p.isKit) return p;
      const comps = compsByKitId.get(p.id) ?? [];
      let computedPrice = 0;
      let effectiveStock = comps.length > 0 ? Infinity : 0;
      for (const c of comps) {
        const price = typeof c.componentPrice === 'string' ? parseFloat(c.componentPrice) : (c.componentPrice as number);
        computedPrice += price * c.quantity;
        const stock = Math.floor((c.componentStock ?? 0) / c.quantity);
        if (stock < effectiveStock) effectiveStock = stock;
      }
      return {
        ...p,
        price: computedPrice.toFixed(2) as any,
        quantity: effectiveStock === Infinity ? 0 : effectiveStock,
      };
    });

    return { ...result, data: enriched };
  }

  async listCategories() {
    return productRepository.listCategories();
  }

  async getById(id: string) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new AppError('Produto não encontrado', 404);
    }
    return product;
  }

  async update(id: string, data: any) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new AppError('Produto não encontrado', 404);
    }

    if (data.sku && data.sku !== product.sku) {
      const productExists = await productRepository.findBySku(data.sku);
      if (productExists) {
        throw new AppError('Este SKU já está cadastrado para outro produto', 400);
      }
    }

    const updatedProduct = await productRepository.update(id, data);

    if (updatedProduct && updatedProduct.sku && data.quantity !== undefined) {
      await googleSheetsService.updateStockInSheet(updatedProduct.sku, updatedProduct.quantity);
    }

    return updatedProduct;
  }

  /**
   * Sincroniza produtos locais com a planilha Google Sheets.
   *
   * Melhorias em relação à versão anterior:
   * - Revive-on-reappear: produto soft-deletado que volta à planilha é reativado em vez de gerar erro de SKU duplicado.
   * - Sem N+1 no lookup: carrega todos os registros relevantes em uma única query batch.
   * - Trava de sanidade: se a planilha retornar 0 linhas ou menos de 50% dos ativos, remoção é cancelada.
   * - Retorna candidatos a remoção (produtos ativos ausentes da planilha) para confirmação no frontend.
   */
  async syncFromSheet(userId: string, ipAddress: string) {
    try {
      const sheetRows = await googleSheetsService.getProductsFromSheet();

      // Linhas com SKU válido (não vazio após trim)
      const validRows = sheetRows.filter(r => r.sku.trim() !== '');
      const sheetSkusTrimmed = validRows.map(r => r.sku.trim());

      // ── Trava de sanidade ──────────────────────────────────────────────────────
      const activeCount = await productRepository.countActives();
      const sanityFailed =
        sheetRows.length === 0 ||
        (activeCount > 0 && validRows.length < activeCount * 0.5);

      let sanityWarning: string | undefined;
      if (sheetRows.length === 0) {
        sanityWarning = 'A planilha retornou 0 linhas — remoção cancelada por segurança. Verifique o Google Sheets.';
      } else if (sanityFailed) {
        sanityWarning = `A planilha retornou ${validRows.length} produto(s) com SKU válido, mas há ${activeCount} produto(s) ativo(s) no sistema (menos de 50%). Remoção cancelada por segurança.`;
      }

      // ── Upsert em lote (sem N+1 de SELECT) ────────────────────────────────────
      // Carrega de uma vez todos os produtos cujo SKU aparece na planilha,
      // incluindo soft-deletados, para suportar o revive-on-reappear.
      const existingBatch = await productRepository.findAllBySkus(sheetSkusTrimmed);
      const byNormalizedSku = new Map<string, typeof existingBatch[0]>(
        existingBatch.map(p => [p.sku!.trim().toLowerCase(), p]),
      );

      let created = 0;
      let updated = 0;
      let revived = 0;
      let skipped = 0;
      const reviveAuditEntries: (typeof auditLogs.$inferInsert)[] = [];

      for (const sp of sheetRows) {
        const sku = sp.sku.trim();
        if (!sku) { skipped++; continue; }

        const found = byNormalizedSku.get(sku.toLowerCase());

        if (!found) {
          await productRepository.create({
            sku,
            name: sp.name,
            price: sp.price,
            quantity: sp.quantity,
            category: sp.category || null,
            description: sp.description || null,
          });
          created++;
        } else if (found.deletedAt !== null) {
          // Produto estava soft-deletado e voltou à planilha → reviver + atualizar
          await productRepository.update(found.id, {
            name: sp.name,
            price: sp.price,
            quantity: sp.quantity,
            category: sp.category || null,
            description: sp.description || null,
          });
          await productRepository.revive(found.id);
          reviveAuditEntries.push({
            id: uuidv4(),
            userId,
            action: 'PRODUCT_REVIVE_SYNC',
            entityType: 'Product',
            entityId: found.id,
            oldValue: { deletedAt: found.deletedAt, sku: found.sku, name: found.name } as any,
            newValue: { deletedAt: null, sku, name: sp.name } as any,
            ipAddress,
          });
          revived++;
        } else {
          // Produto ativo — atualiza apenas se houver diferença
          const localPrice = typeof found.price === 'string' ? parseFloat(found.price) : (found.price as number);
          if (
            found.quantity !== sp.quantity ||
            localPrice !== sp.price ||
            found.name !== sp.name ||
            found.category !== (sp.category || null) ||
            found.description !== (sp.description || null)
          ) {
            await productRepository.update(found.id, {
              name: sp.name,
              price: sp.price,
              quantity: sp.quantity,
              category: sp.category || null,
              description: sp.description || null,
            });
          }
          updated++;
        }
      }

      // Audit batch dos revives (uma única INSERT com múltiplas linhas)
      if (reviveAuditEntries.length > 0) {
        await db.insert(auditLogs).values(reviveAuditEntries);
      }

      // ── Candidatos a remoção ───────────────────────────────────────────────────
      // Só calcula se a trava de sanidade passou
      let removalCandidates: Array<{ id: string; sku: string; name: string; category: string | null; quantity: number }> = [];
      if (!sanityFailed) {
        const sheetSkuSet = new Set(sheetSkusTrimmed.map(s => s.toLowerCase()));
        const activeWithSku = await productRepository.findActiveWithSku();
        removalCandidates = activeWithSku
          .filter(p => !sheetSkuSet.has((p.sku ?? '').trim().toLowerCase()))
          .map(p => ({
            id: p.id,
            sku: p.sku!,
            name: p.name,
            category: p.category ?? null,
            quantity: p.quantity ?? 0,
          }));
      }

      return {
        upsertSummary: { created, updated, revived, skipped },
        removalCandidates,
        ...(sanityWarning ? { sanityWarning } : {}),
      };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erro na sincronização: ${error.message}`, 502);
    }
  }

  /**
   * Confirma a remoção dos produtos selecionados no modal.
   * Re-lê a planilha como segurança final: só remove os que CONTINUAM ausentes.
   */
  async confirmRemoval(productIds: string[], userId: string, ipAddress: string) {
    if (productIds.length === 0) return { removed: 0, skippedReappeared: [] };

    // Re-lê a planilha para garantir que nada reapareceu desde o preview
    const sheetRows = await googleSheetsService.getProductsFromSheet();
    const sheetSkuSet = new Set(
      sheetRows
        .map(r => r.sku.trim().toLowerCase())
        .filter(s => s !== ''),
    );

    // Carrega todos os produtos-alvo em batch
    const targets = await productRepository.findByIds(productIds);

    const toRemove = targets.filter(
      p => p.sku && !sheetSkuSet.has(p.sku.trim().toLowerCase()) && !p.deletedAt,
    );
    const skippedReappeared = targets
      .filter(p => !p.sku || (p.sku && sheetSkuSet.has(p.sku.trim().toLowerCase())))
      .map(p => ({ id: p.id, sku: p.sku ?? '', name: p.name }));

    if (toRemove.length === 0) {
      return { removed: 0, skippedReappeared };
    }

    // Soft-delete em lote (uma única query)
    await productRepository.softDeleteBatch(toRemove.map(p => p.id));

    // Audit batch — uma única INSERT com múltiplas linhas
    await db.insert(auditLogs).values(
      toRemove.map(p => ({
        id: uuidv4(),
        userId,
        action: 'PRODUCT_SOFT_DELETE_SYNC',
        entityType: 'Product',
        entityId: p.id,
        oldValue: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          quantity: p.quantity,
          price: p.price,
        } as any,
        newValue: null,
        ipAddress,
      })),
    );

    return { removed: toRemove.length, skippedReappeared };
  }

  async delete(id: string) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new AppError('Produto não encontrado', 404);
    }
    await productRepository.delete(id);
  }
}
