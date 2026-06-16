import { AppError } from '../utils/AppError';
import { SellerRepository } from '../repositories/seller.repository';

const sellerRepository = new SellerRepository();

export class SellerService {
  async list() {
    return sellerRepository.list();
  }

  async listActive() {
    return sellerRepository.listActive();
  }

  async create(name: string) {
    if (!name?.trim()) throw new AppError('Nome do vendedor é obrigatório', 400);
    return sellerRepository.create(name.trim());
  }

  async update(id: string, data: { name?: string; active?: boolean }) {
    const seller = await sellerRepository.findById(id);
    if (!seller || seller.deletedAt) throw new AppError('Vendedor não encontrado', 404);
    if (data.name !== undefined && !data.name.trim()) throw new AppError('Nome não pode ser vazio', 400);
    if (data.name) data.name = data.name.trim();
    await sellerRepository.update(id, data);
  }

  async remove(id: string) {
    const seller = await sellerRepository.findById(id);
    if (!seller || seller.deletedAt) throw new AppError('Vendedor não encontrado', 404);
    await sellerRepository.softDelete(id);
  }
}
