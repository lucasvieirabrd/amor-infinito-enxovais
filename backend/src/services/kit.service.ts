import { ProductRepository } from '../repositories/product.repository';
import { KitRepository } from '../repositories/kit.repository';
import { AppError } from '../utils/AppError';
import { db } from '../database';
import { auditLogs } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

const productRepository = new ProductRepository();
const kitRepository = new KitRepository();

function computeKitStats(components: Awaited<ReturnType<KitRepository['findComponentsByKitId']>>) {
  let computedPrice = 0;
  let effectiveStock = Infinity;

  for (const c of components) {
    const price = typeof c.componentPrice === 'string' ? parseFloat(c.componentPrice) : (c.componentPrice as number);
    computedPrice += price * c.quantity;
    const stock = Math.floor((c.componentStock ?? 0) / c.quantity);
    if (stock < effectiveStock) effectiveStock = stock;
  }

  return {
    price: components.length > 0 ? computedPrice : 0,
    quantity: components.length > 0 ? (effectiveStock === Infinity ? 0 : effectiveStock) : 0,
  };
}

export class KitService {
  async list() {
    const kits = await kitRepository.listKits();
    if (kits.length === 0) return [];

    const kitIds = kits.map(k => k.id);
    const allComponents = await kitRepository.findComponentsByKitIds(kitIds);

    const compsByKitId = new Map<string, typeof allComponents>();
    for (const c of allComponents) {
      if (!compsByKitId.has(c.kitProductId)) compsByKitId.set(c.kitProductId, []);
      compsByKitId.get(c.kitProductId)!.push(c);
    }

    return kits.map(kit => {
      const comps = compsByKitId.get(kit.id) ?? [];
      const { price, quantity } = computeKitStats(comps);
      return {
        ...kit,
        price: price.toFixed(2),
        quantity,
        components: comps.map(c => ({
          componentProductId: c.componentProductId,
          componentName: c.componentName,
          componentSku: c.componentSku,
          quantity: c.quantity,
          unitPrice: typeof c.componentPrice === 'string' ? parseFloat(c.componentPrice) : (c.componentPrice as number),
        })),
      };
    });
  }

  async getById(id: string) {
    const kit = await productRepository.findById(id);
    if (!kit || !kit.isKit) throw new AppError('Kit não encontrado', 404);

    const components = await kitRepository.findComponentsByKitId(id);
    const { price, quantity } = computeKitStats(components);

    return {
      ...kit,
      price: price.toFixed(2),
      quantity,
      components: components.map(c => ({
        componentProductId: c.componentProductId,
        componentName: c.componentName,
        componentSku: c.componentSku,
        quantity: c.quantity,
        unitPrice: typeof c.componentPrice === 'string' ? parseFloat(c.componentPrice) : (c.componentPrice as number),
      })),
    };
  }

  async create(
    data: { name: string; sku?: string; category?: string | null; description?: string | null; minStockLevel?: number },
    components: Array<{ componentProductId: string; quantity: number }>,
    userId: string,
    ipAddress: string,
  ) {
    if (components.length === 0) throw new AppError('Kit deve ter ao menos um componente', 400);

    if (data.sku) {
      const exists = await productRepository.findBySku(data.sku);
      if (exists) throw new AppError('Este SKU já está cadastrado para outro produto', 400);
    }

    // Validate components exist and are not kits themselves
    for (const c of components) {
      const comp = await productRepository.findById(c.componentProductId);
      if (!comp) throw new AppError(`Componente ${c.componentProductId} não encontrado`, 404);
      if (comp.isKit) throw new AppError(`Componente "${comp.name}" é um kit — kits não podem ser componentes de outros kits`, 400);
    }

    const kitProduct = await productRepository.create({
      name: data.name,
      sku: data.sku || null,
      category: data.category || null,
      description: data.description || null,
      quantity: 0,
      price: '0.00',
      minStockLevel: data.minStockLevel ?? 0,
      isKit: true,
    });

    if (!kitProduct) throw new AppError('Erro ao criar kit', 500);

    await kitRepository.createComponents(kitProduct.id, components);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'KIT_CREATE',
      entityType: 'Product',
      entityId: kitProduct.id,
      oldValue: null,
      newValue: { name: data.name, sku: data.sku, components } as any,
      ipAddress,
    });

    return this.getById(kitProduct.id);
  }

  async update(
    id: string,
    data: { name?: string; sku?: string; category?: string | null; description?: string | null; minStockLevel?: number },
    components: Array<{ componentProductId: string; quantity: number }> | undefined,
    userId: string,
    ipAddress: string,
  ) {
    const kit = await productRepository.findById(id);
    if (!kit || !kit.isKit) throw new AppError('Kit não encontrado', 404);

    if (data.sku && data.sku !== kit.sku) {
      const exists = await productRepository.findBySku(data.sku);
      if (exists) throw new AppError('Este SKU já está cadastrado para outro produto', 400);
    }

    const oldComponents = await kitRepository.findComponentsByKitId(id);

    if (components !== undefined) {
      if (components.length === 0) throw new AppError('Kit deve ter ao menos um componente', 400);
      for (const c of components) {
        const comp = await productRepository.findById(c.componentProductId);
        if (!comp) throw new AppError(`Componente ${c.componentProductId} não encontrado`, 404);
        if (comp.isKit) throw new AppError(`Componente "${comp.name}" é um kit — kits não podem ser componentes de outros kits`, 400);
      }
      await kitRepository.deleteComponentsByKitId(id);
      await kitRepository.createComponents(id, components);
    }

    await productRepository.update(id, {
      ...(data.name && { name: data.name }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.minStockLevel !== undefined && { minStockLevel: data.minStockLevel }),
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'KIT_UPDATE',
      entityType: 'Product',
      entityId: id,
      oldValue: { name: kit.name, sku: kit.sku, components: oldComponents.map(c => ({ componentProductId: c.componentProductId, quantity: c.quantity })) } as any,
      newValue: { ...data, components } as any,
      ipAddress,
    });

    return this.getById(id);
  }

  async delete(id: string, userId: string, ipAddress: string) {
    const kit = await productRepository.findById(id);
    if (!kit || !kit.isKit) throw new AppError('Kit não encontrado', 404);

    const oldComponents = await kitRepository.findComponentsByKitId(id);

    await productRepository.delete(id);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId,
      action: 'KIT_DELETE',
      entityType: 'Product',
      entityId: id,
      oldValue: { name: kit.name, sku: kit.sku, components: oldComponents.map(c => ({ componentProductId: c.componentProductId, quantity: c.quantity })) } as any,
      newValue: null,
      ipAddress,
    });
  }
}
