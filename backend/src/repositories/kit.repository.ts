import { db } from '../database';
import { kitComponents, products } from '../database/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class KitRepository {
  async findComponentsByKitId(kitId: string) {
    return db
      .select({
        id: kitComponents.id,
        kitProductId: kitComponents.kitProductId,
        componentProductId: kitComponents.componentProductId,
        quantity: kitComponents.quantity,
        componentName: products.name,
        componentSku: products.sku,
        componentPrice: products.price,
        componentStock: products.quantity,
      })
      .from(kitComponents)
      .innerJoin(products, eq(kitComponents.componentProductId, products.id))
      .where(and(
        isNull(kitComponents.deletedAt),
        eq(kitComponents.kitProductId, kitId),
        isNull(products.deletedAt),
      ));
  }

  /** Batch load components for multiple kits — sem N+1. */
  async findComponentsByKitIds(kitIds: string[]) {
    if (kitIds.length === 0) return [];
    return db
      .select({
        id: kitComponents.id,
        kitProductId: kitComponents.kitProductId,
        componentProductId: kitComponents.componentProductId,
        quantity: kitComponents.quantity,
        componentName: products.name,
        componentSku: products.sku,
        componentPrice: products.price,
        componentStock: products.quantity,
      })
      .from(kitComponents)
      .innerJoin(products, eq(kitComponents.componentProductId, products.id))
      .where(and(
        isNull(kitComponents.deletedAt),
        inArray(kitComponents.kitProductId, kitIds),
        isNull(products.deletedAt),
      ));
  }

  async createComponents(kitId: string, components: Array<{ componentProductId: string; quantity: number }>) {
    if (components.length === 0) return;
    await db.insert(kitComponents).values(
      components.map(c => ({
        id: uuidv4(),
        kitProductId: kitId,
        componentProductId: c.componentProductId,
        quantity: c.quantity,
      })),
    );
  }

  /** Remove all components for a kit (hard delete — managed as a full replace set). */
  async deleteComponentsByKitId(kitId: string) {
    await db.delete(kitComponents).where(eq(kitComponents.kitProductId, kitId));
  }

  async listKits() {
    return db
      .select()
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.isKit, true)));
  }
}
