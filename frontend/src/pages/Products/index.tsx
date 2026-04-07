import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiRefreshCw, FiAlertTriangle, FiPlus, FiBox, FiEdit } from 'react-icons/fi';
import { Button, Card, Badge, Loading, Modal, Input } from '../../components/ui';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  priceDisplay?: string;
  quantity: number;
  minStockLevel: number;
}

export const Products: React.FC = () => {
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({ quantity: 0, price: 0 });
  const queryClient = useQueryClient();

  // Busca de produtos via API
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const response = await api.get('/products', { params: { search } });
      return response.data.data as Product[];
    },
  });

  // Mutação para sincronizar com Google Sheets
  const syncMutation = useMutation({
    mutationFn: () => api.post('/products/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      alert('Sincronização com Google Sheets concluída com sucesso!');
    },
    onError: () => {
      alert('Erro ao sincronizar com Google Sheets. Verifique as credenciais.');
    }
  });

  // Mutação para atualizar produto
  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/products/${editingProduct?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditingProduct(null);
      alert('Produto atualizado com sucesso!');
    },
    onError: () => {
      alert('Erro ao atualizar produto.');
    }
  });

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      quantity: product.quantity,
      price: typeof product.price === 'string' ? parseFloat(product.price) : product.price
    });
  };

  const handleSaveEdit = () => {
    if (editingProduct) {
      updateMutation.mutate(editFormData);
    }
  };

  const lowStockCount = products?.filter(p => p.quantity <= p.minStockLevel).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Produtos / Estoque</h1>
          <p className="text-gray-600 mt-1">Controle integrado com Google Sheets</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => syncMutation.mutate()}
            loading={syncMutation.isPending}
            className="flex items-center gap-2"
          >
            <FiRefreshCw size={20} />
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Planilha'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex items-center gap-2"
          >
            <FiPlus size={20} />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Search and Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nome ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base pl-10 w-full"
            />
          </div>
        </Card>

        <Card className="bg-secondary bg-opacity-10 border-secondary border-opacity-20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary bg-opacity-20 rounded-lg">
              <FiAlertTriangle className="text-secondary" size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Atenção ao Estoque</p>
              <p className="text-xs text-gray-600">
                {lowStockCount} produto{lowStockCount !== 1 ? 's' : ''} abaixo do nível mínimo.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <Loading variant="skeleton" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products?.map((product) => {
            const isLowStock = product.quantity <= product.minStockLevel;
            return (
              <Card key={product.id} className="hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-background rounded-lg">
                    <FiBox className="text-gray-400" size={24} />
                  </div>
                  <Badge variant={isLowStock ? 'error' : 'success'}>
                    {product.quantity} em estoque
                  </Badge>
                </div>

                <h4 className="font-semibold text-gray-900 mb-1 truncate">{product.name}</h4>
                <p className="text-xs text-gray-500 mb-4">SKU: {product.sku}</p>

                <div className="flex items-end justify-between pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Preço de Venda</p>
                    <p className="text-lg font-bold text-primary">
                      {product.priceDisplay || `R$ ${parseFloat(product.price.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={() => handleEditClick(product)}
                  >
                    <FiEdit size={16} />
                    Editar
                  </Button>
                </div>

                {isLowStock && (
                  <div className="mt-4 p-3 bg-error bg-opacity-10 rounded-lg border border-error border-opacity-20">
                    <p className="text-xs font-semibold text-error uppercase">Reposição Necessária</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingProduct && (
        <Modal
          isOpen={!!editingProduct}
          onClose={() => setEditingProduct(null)}
          title="Editar Produto"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
              <Input
                type="text"
                value={editingProduct.name}
                disabled
                className="bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
              <Input
                type="text"
                value={editingProduct.sku}
                disabled
                className="bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade</label>
              <Input
                type="number"
                value={editFormData.quantity}
                onChange={(e) => setEditFormData({ ...editFormData, quantity: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preco (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={editFormData.price}
                onChange={(e) => setEditFormData({ ...editFormData, price: parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => setEditingProduct(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveEdit}
                loading={updateMutation.isPending}
              >
                Salvar Alteracoes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
