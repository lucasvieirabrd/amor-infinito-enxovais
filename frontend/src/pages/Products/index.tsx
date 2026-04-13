import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import api from '../../services/api';
import { FiSearch, FiRefreshCw, FiAlertTriangle, FiPlus, FiBox, FiEdit, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
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

interface PaginatedResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const Products: React.FC = () => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({ quantity: 0, price: 0 });
  const queryClient = useQueryClient();

  const ITEMS_PER_PAGE = 12;

  // Busca de produtos via API com paginação
  const { data: response, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch, page],
    queryFn: async () => {
      const res = await api.get('/products', {
        params: { search: debouncedSearch, page, limit: ITEMS_PER_PAGE },
      });
      return res.data as PaginatedResponse;
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
    },
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
    },
  });

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      quantity: product.quantity,
      price: typeof product.price === 'string' ? parseFloat(product.price) : product.price,
    });
  };

  const handleSaveEdit = () => {
    if (editingProduct) {
      updateMutation.mutate(editFormData);
    }
  };

  const lowStockCount = response?.data?.filter((p) => p.quantity <= p.minStockLevel).length || 0;

  if (isLoading && !response) {
    return <Loading />;
  }

  const startIndex = (page - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE - 1, response?.total || 0);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header com título e contadores */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Produtos</h1>
            <Badge variant="primary" className="text-lg">
              {response?.total || 0}
            </Badge>
            {lowStockCount > 0 && (
              <Badge variant="error" className="flex items-center gap-1">
                <FiAlertTriangle size={14} /> {lowStockCount} baixo estoque
              </Badge>
            )}
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
            <Button variant="primary" size="lg" className="flex items-center gap-2">
              <FiPlus size={20} />
              Novo Produto
            </Button>
          </div>
        </div>

        {/* Barra de busca */}
        <Card className="p-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou SKU..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>
        </Card>

        {/* Grade de produtos */}
        <div>
          {isLoading ? (
            <Loading />
          ) : response?.data && response.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(response?.data || []).map((product) => (
                <Card key={product.id} className="p-4 hover:shadow-lg transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FiBox className="text-primary" size={20} />
                    </div>
                    <button
                      onClick={() => handleEditClick(product)}
                      className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition"
                    >
                      <FiEdit size={16} />
                    </button>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-gray-500 mb-3">SKU: {product.sku || '-'}</p>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Preço:</span>
                      <span className="font-semibold text-gray-900">
                        {product.priceDisplay || `R$ ${parseFloat(product.price.toString()).toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Estoque:</span>
                      <Badge
                        variant={
                          product.quantity <= product.minStockLevel
                            ? 'error'
                            : product.quantity <= product.minStockLevel * 1.5
                            ? 'warning'
                            : 'success'
                        }
                      >
                        {product.quantity} un
                      </Badge>
                    </div>
                  </div>

                  {product.quantity <= product.minStockLevel && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      ⚠️ Estoque baixo (mín: {product.minStockLevel})
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-12 text-gray-500">
              Nenhum produto encontrado
            </Card>
          )}
        </div>

        {/* Paginação */}
        {response && response.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Mostrando {startIndex} a {endIndex} de {response.total} produtos
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <FiChevronLeft size={18} /> Anterior
              </Button>
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg">
                <span className="text-sm text-gray-700">
                  Página {page} de {response.totalPages}
                </span>
              </div>
              <Button
                onClick={() => setPage(Math.min(response.totalPages, page + 1))}
                disabled={page === response.totalPages}
                variant="secondary"
                className="flex items-center gap-2"
              >
                Próxima <FiChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      <Modal
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        title={`Editar ${editingProduct?.name}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
            <Input
              type="number"
              value={editFormData.quantity}
              onChange={(e) => setEditFormData({ ...editFormData, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
            <Input
              type="number"
              step="0.01"
              value={editFormData.price}
              onChange={(e) => setEditFormData({ ...editFormData, price: Number(e.target.value) })}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleSaveEdit} loading={updateMutation.isPending} className="flex-1">
              Salvar
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditingProduct(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
