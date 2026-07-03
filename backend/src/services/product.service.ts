import { ProductRepository } from '../repositories/product.repository';
import { GoogleSheetsService } from '../integrations/googleSheets.service';
import { AppError } from '../utils/AppError';

const productRepository = new ProductRepository();
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

    // Sincroniza com Google Sheets
    await googleSheetsService.addProductToSheet(product);

    return product;
  }

  async list(page = 1, limit = 10, search?: string, category?: string) {
    return productRepository.list(page, limit, search, category);
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
    
    // Sincroniza estoque se houver alteração de quantidade e SKU disponível
    if (updatedProduct && updatedProduct.sku && data.quantity !== undefined) {
      await googleSheetsService.updateStockInSheet(updatedProduct.sku, updatedProduct.quantity);
    }

    return updatedProduct;
  }

  /**
   * Sincroniza os produtos locais com os dados da planilha do Google Sheets.
   */
  async syncFromSheet() {
    try {
      const sheetProducts = await googleSheetsService.getProductsFromSheet();
      
      for (const sheetProduct of sheetProducts) {
        const localProduct = await productRepository.findBySku(sheetProduct.sku);
        
        if (localProduct) {
          const localPrice = typeof localProduct.price === 'string' ? parseFloat(localProduct.price) : localProduct.price;
          if (
            localProduct.quantity !== sheetProduct.quantity ||
            localPrice !== sheetProduct.price ||
            localProduct.category !== (sheetProduct.category || null)
          ) {
            await productRepository.update(localProduct.id, {
              quantity: sheetProduct.quantity,
              price: sheetProduct.price,
              name: sheetProduct.name,
              category: sheetProduct.category || null,
            });
          }
        } else {
          await productRepository.create({
            sku: sheetProduct.sku,
            name: sheetProduct.name,
            price: sheetProduct.price,
            quantity: sheetProduct.quantity,
            category: sheetProduct.category || null,
          });
        }
      }
      
      return { message: 'Sincronização concluída com sucesso' };
    } catch (error: any) {
      throw new AppError(`Erro na sincronização: ${error.message}`, 502);
    }
  }

  async delete(id: string) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new AppError('Produto não encontrado', 404);
    }
    await productRepository.delete(id);
  }
}
