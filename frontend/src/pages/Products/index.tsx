import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiRefreshCw, FiAlertTriangle, FiPlus, FiBox, FiEdit, FiChevronLeft, FiChevronRight, FiFileText, FiTrash2, FiLayers } from 'react-icons/fi';
import { Button, Card, Badge, Loading, Modal, Input } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { NfImportModal } from './NfImportModal';
import { KitModal } from './KitModal';
import { toast } from 'react-toastify';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  price: string | number;
  priceDisplay?: string;
  quantity: number;
  minStockLevel: number;
  isKit: boolean;
}

interface KitComponent {
  componentProductId: string;
  componentName: string;
  componentSku: string | null;
  quantity: number;
  unitPrice: number;
}

interface Kit {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  minStockLevel: number;
  price: string | number;
  quantity: number;
  components: KitComponent[];
}

interface PaginatedResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RemovalCandidate {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  quantity: number;
}

interface SyncResult {
  upsertSummary: { created: number; updated: number; revived: number; skipped: number };
  removalCandidates: RemovalCandidate[];
  sanityWarning?: string;
}

interface ConfirmRemovalResult {
  removed: number;
  skippedReappeared: Array<{ id: string; sku: string; name: string }>;
}

export const Products: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({ quantity: 0, price: 0, category: '' });
  const [showNfImport, setShowNfImport] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '', sku: '', category: '', description: '', quantity: 0, price: 0, minStockLevel: 0,
  });
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Estado do modal de remoção
  const [removalCandidates, setRemovalCandidates] = useState<RemovalCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRemovalModal, setShowRemovalModal] = useState(false);

  // Estado de gerenciamento de kits
  const [showKitPanel, setShowKitPanel] = useState(false);
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  const [showKitModal, setShowKitModal] = useState(false);
  const [deletingKitId, setDeletingKitId] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 12;

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const res = await api.get('/products/categories');
      return res.data as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter, page],
    queryFn: async () => {
      const res = await api.get('/products', {
        params: { search, page, limit: ITEMS_PER_PAGE, ...(categoryFilter && { category: categoryFilter }) },
      });
      return res.data as PaginatedResponse;
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/products/sync'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      const data = res.data as SyncResult;
      const s = data.upsertSummary;

      const summaryParts = [`${s.created} criado(s)`, `${s.updated} atualizado(s)`];
      if (s.revived > 0) summaryParts.push(`${s.revived} reativado(s)`);
      const summaryMsg = summaryParts.join(', ');

      if (data.sanityWarning) {
        toast.warn(data.sanityWarning, { autoClose: 8000 });
        toast.success(`Sync concluído: ${summaryMsg}.`);
        return;
      }

      if (data.removalCandidates?.length > 0) {
        setRemovalCandidates(data.removalCandidates);
        setSelectedIds(new Set(data.removalCandidates.map(p => p.id)));
        setShowRemovalModal(true);
        toast.success(`Sync concluído: ${summaryMsg}. ${data.removalCandidates.length} produto(s) ausente(s) da planilha — confirme a remoção.`);
      } else {
        toast.success(`Sincronização concluída! ${summaryMsg}.`);
      }
    },
    onError: () => {
      toast.error('Erro ao sincronizar com Google Sheets. Verifique as credenciais.');
    },
  });

  const confirmRemovalMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post('/products/confirm-removal', { productIds: ids }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      const data = res.data as ConfirmRemovalResult;
      setShowRemovalModal(false);
      setRemovalCandidates([]);
      setSelectedIds(new Set());

      if (data.skippedReappeared?.length > 0) {
        toast.info(
          `${data.removed} produto(s) removido(s). ${data.skippedReappeared.length} ignorado(s) pois reapareceram na planilha.`,
          { autoClose: 7000 },
        );
      } else {
        toast.success(`${data.removed} produto(s) removido(s) com sucesso.`);
      }
    },
    onError: () => {
      toast.error('Erro ao confirmar remoção. Tente novamente.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/products/${editingProduct?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditingProduct(null);
      toast.success('Produto atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar produto.');
    },
  });

  const { data: kits = [], isLoading: kitsLoading, isError: kitsError } = useQuery<Kit[]>({
    queryKey: ['kits'],
    queryFn: async () => {
      const res = await api.get('/kits');
      return res.data as Kit[];
    },
    enabled: showKitPanel,
    retry: 1,
  });

  const createProductMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setShowNewProductModal(false);
      setNewProductForm({ name: '', sku: '', category: '', description: '', quantity: 0, price: 0, minStockLevel: 0 });
      toast.success('Produto cadastrado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar produto.');
    },
  });

  const createKitMutation = useMutation({
    mutationFn: (data: any) => api.post('/kits', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowKitModal(false);
      setEditingKit(null);
      toast.success('Kit criado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao criar kit.');
    },
  });

  const updateKitMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/kits/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowKitModal(false);
      setEditingKit(null);
      toast.success('Kit atualizado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao atualizar kit.');
    },
  });

  const deleteKitMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/kits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeletingKitId(null);
      toast.success('Kit removido com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao remover kit.');
    },
  });

  const handleKitSave = (data: any) => {
    if (editingKit) {
      updateKitMutation.mutate({ id: editingKit.id, data });
    } else {
      createKitMutation.mutate(data);
    }
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      quantity: product.quantity,
      price: typeof product.price === 'string' ? parseFloat(product.price) : product.price,
      category: product.category ?? '',
    });
  };

  const handleSaveEdit = () => {
    if (editingProduct) {
      updateMutation.mutate({
        ...editFormData,
        category: editFormData.category || null,
      });
    }
  };

  const toggleRemovalId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirmRemoval = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.warn('Nenhum produto selecionado para remoção.');
      return;
    }
    confirmRemovalMutation.mutate(ids);
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
              disabled={syncMutation.isPending}
              className="flex items-center gap-2"
            >
              <FiRefreshCw size={20} />
              {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Planilha'}
            </Button>
            {user?.role === 'admin' && (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setShowKitPanel(v => !v)}
                  className="flex items-center gap-2"
                >
                  <FiLayers size={20} />
                  {showKitPanel ? 'Ocultar Kits' : 'Gerenciar Kits'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setShowNfImport(true)}
                  className="flex items-center gap-2"
                >
                  <FiFileText size={20} />
                  Importar Nota
                </Button>
              </>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowNewProductModal(true)}
              className="flex items-center gap-2"
            >
              <FiPlus size={20} />
              Novo Produto
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou SKU..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value === '') { setSearch(''); setPage(1); }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
                }}
                className="pl-10"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas as categorias</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </Card>

        {/* Painel de Kits */}
        {showKitPanel && user?.role === 'admin' && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FiLayers className="text-purple-600" size={20} />
                <h2 className="text-lg font-bold text-gray-900">Kits cadastrados</h2>
                <Badge variant="primary">{kits.length}</Badge>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={() => { setEditingKit(null); setShowKitModal(true); }}
                className="flex items-center gap-2"
              >
                <FiPlus size={18} /> Novo Kit
              </Button>
            </div>

            {kitsError ? (
              <p className="text-center text-red-500 py-6 text-sm">
                Erro ao carregar kits. Verifique se o backend está atualizado e tente novamente.
              </p>
            ) : kitsLoading ? (
              <Loading />
            ) : kits.length === 0 ? (
              <p className="text-center text-gray-400 py-6">Nenhum kit cadastrado</p>
            ) : (
              <div className="space-y-2">
                {kits.map(kit => (
                  <div key={kit.id} className="flex items-center justify-between p-3 bg-purple-50 border border-purple-100 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{kit.name}</span>
                        {kit.sku && <span className="text-xs text-gray-400 font-mono">{kit.sku}</span>}
                        {kit.category && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{kit.category}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {kit.components.length} componente(s) · Estoque efetivo: {kit.quantity} un
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="font-bold text-purple-700">R$ {parseFloat(kit.price.toString()).toFixed(2)}</span>
                      <button
                        onClick={() => { setEditingKit(kit); setShowKitModal(true); }}
                        className="p-1.5 hover:bg-purple-100 rounded text-purple-600 transition"
                      >
                        <FiEdit size={16} />
                      </button>
                      <button
                        onClick={() => setDeletingKitId(kit.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Grade de produtos */}
        <div>
          {isLoading ? (
            <Loading />
          ) : response?.data && response.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(response?.data || []).map((product) => (
                <Card key={product.id} className="p-4 hover:shadow-lg transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${product.isKit ? 'bg-purple-100' : 'bg-primary/10'}`}>
                      {product.isKit
                        ? <FiLayers className="text-purple-600" size={20} />
                        : <FiBox className="text-primary" size={20} />
                      }
                    </div>
                    <div className="flex items-center gap-1.5">
                      {product.isKit && (
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">KIT</span>
                      )}
                      {parseFloat(product.price.toString()) === 0 && !product.isKit && (
                        <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">⚠ sem preço</span>
                      )}
                      {!product.isKit && (
                        <button
                          onClick={() => handleEditClick(product)}
                          className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition"
                        >
                          <FiEdit size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs text-gray-500">SKU: {product.sku || '-'}</p>
                    {product.category && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {product.category}
                      </span>
                    )}
                  </div>

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

      <NfImportModal
        isOpen={showNfImport}
        onClose={() => setShowNfImport(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
      />

      {/* Modal de Edição */}
      <Modal
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        title={`Editar ${editingProduct?.name}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={editFormData.category}
              onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem categoria</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
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

      {/* Modal de Novo Produto */}
      <Modal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        title="Novo Produto"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <Input
              value={newProductForm.name}
              onChange={e => setNewProductForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome do produto"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <Input
                value={newProductForm.sku}
                onChange={e => setNewProductForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="Ex: PROD001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={newProductForm.category}
                onChange={e => setNewProductForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Sem categoria</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <Input
              value={newProductForm.description}
              onChange={e => setNewProductForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrição do produto"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={newProductForm.price || ''}
                onChange={e => setNewProductForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <Input
                type="number"
                min="0"
                value={newProductForm.quantity}
                onChange={e => setNewProductForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estoque mín.</label>
              <Input
                type="number"
                min="0"
                value={newProductForm.minStockLevel}
                onChange={e => setNewProductForm(f => ({ ...f, minStockLevel: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => createProductMutation.mutate({
                name: newProductForm.name,
                sku: newProductForm.sku || undefined,
                category: newProductForm.category || null,
                description: newProductForm.description || null,
                quantity: newProductForm.quantity,
                price: newProductForm.price,
                minStockLevel: newProductForm.minStockLevel,
              })}
              loading={createProductMutation.isPending}
              disabled={newProductForm.name.length < 3 || newProductForm.price <= 0 || createProductMutation.isPending}
              className="flex-1"
            >
              Cadastrar Produto
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowNewProductModal(false)}
              disabled={createProductMutation.isPending}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <KitModal
        isOpen={showKitModal}
        kit={editingKit}
        onClose={() => { setShowKitModal(false); setEditingKit(null); }}
        onSave={handleKitSave}
        isSaving={createKitMutation.isPending || updateKitMutation.isPending}
        categories={categories}
      />

      {/* Confirmação de exclusão de kit */}
      <Modal
        isOpen={!!deletingKitId}
        onClose={() => setDeletingKitId(null)}
        title="Remover Kit"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Tem certeza que deseja remover este kit? O estoque dos componentes <strong>não</strong> será afetado.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => deletingKitId && deleteKitMutation.mutate(deletingKitId)}
              loading={deleteKitMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              Remover
            </Button>
            <Button variant="secondary" onClick={() => setDeletingKitId(null)} className="flex-1">
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal de Confirmação de Remoção ── */}
      {showRemovalModal && user?.role === 'admin' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            {/* Header */}
            <div className="flex items-start gap-3 p-6 border-b border-gray-100">
              <div className="p-2 bg-red-50 rounded-lg shrink-0">
                <FiTrash2 className="text-red-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Confirmar Remoção de Produtos</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Os produtos abaixo estão ativos no sistema mas <strong>não foram encontrados na planilha</strong>.
                  Desmarque os que quiser manter e clique em "Confirmar exclusão".
                </p>
              </div>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === removalCandidates.length}
                        onChange={() => {
                          if (selectedIds.size === removalCandidates.length) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(new Set(removalCandidates.map(p => p.id)));
                          }
                        }}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-gray-600 font-medium">Código (SKU)</th>
                    <th className="px-4 py-3 text-left text-gray-600 font-medium">Nome</th>
                    <th className="px-4 py-3 text-left text-gray-600 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-right text-gray-600 font-medium">Estoque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {removalCandidates.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => toggleRemovalId(p.id)}
                      className={`cursor-pointer transition-colors ${selectedIds.has(p.id) ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleRemovalId(p.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500">{p.category || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${p.quantity === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
                          {p.quantity} un
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-red-600">{selectedIds.size}</span> de {removalCandidates.length} selecionado(s) para remoção
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowRemovalModal(false);
                    setRemovalCandidates([]);
                    setSelectedIds(new Set());
                  }}
                  disabled={confirmRemovalMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmRemoval}
                  loading={confirmRemovalMutation.isPending}
                  disabled={confirmRemovalMutation.isPending || selectedIds.size === 0}
                  className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                >
                  <FiTrash2 size={15} />
                  {confirmRemovalMutation.isPending ? 'Removendo...' : `Confirmar exclusão (${selectedIds.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
