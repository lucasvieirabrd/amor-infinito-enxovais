import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiX, FiPlus, FiTrash2 } from 'react-icons/fi';
import { Button, Input, Modal } from '../../components/ui';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  quantity: number;
  isKit: boolean;
}

interface KitComponent {
  componentProductId: string;
  componentName: string;
  componentSku: string | null;
  quantity: number;
  unitPrice: number;
}

interface KitFormData {
  name: string;
  sku: string;
  category: string;
  description: string;
  minStockLevel: number;
  components: KitComponent[];
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

interface Props {
  isOpen: boolean;
  kit: Kit | null;
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
  categories: string[];
}

export const KitModal: React.FC<Props> = ({ isOpen, kit, onClose, onSave, isSaving, categories }) => {
  const [form, setForm] = useState<KitFormData>({
    name: '',
    sku: '',
    category: '',
    description: '',
    minStockLevel: 0,
    components: [],
  });
  const [componentSearch, setComponentSearch] = useState('');
  const [showComponentSearch, setShowComponentSearch] = useState(false);

  useEffect(() => {
    if (kit) {
      setForm({
        name: kit.name,
        sku: kit.sku ?? '',
        category: kit.category ?? '',
        description: kit.description ?? '',
        minStockLevel: kit.minStockLevel,
        components: kit.components,
      });
    } else {
      setForm({ name: '', sku: '', category: '', description: '', minStockLevel: 0, components: [] });
    }
  }, [kit, isOpen]);

  const { data: searchResults } = useQuery<ProductOption[]>({
    queryKey: ['component-search', componentSearch],
    queryFn: async () => {
      if (componentSearch.length < 2) return [];
      const res = await api.get('/products', { params: { search: componentSearch, limit: 15 } });
      return (res.data.data as ProductOption[]).filter(p => !p.isKit);
    },
    enabled: componentSearch.length >= 2,
  });

  const addComponent = (product: ProductOption) => {
    const already = form.components.find(c => c.componentProductId === product.id);
    if (already) {
      setForm(f => ({
        ...f,
        components: f.components.map(c =>
          c.componentProductId === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        ),
      }));
    } else {
      setForm(f => ({
        ...f,
        components: [
          ...f.components,
          {
            componentProductId: product.id,
            componentName: product.name,
            componentSku: product.sku ?? null,
            quantity: 1,
            unitPrice: parseFloat(product.price.toString()),
          },
        ],
      }));
    }
    setComponentSearch('');
    setShowComponentSearch(false);
  };

  const removeComponent = (productId: string) => {
    setForm(f => ({ ...f, components: f.components.filter(c => c.componentProductId !== productId) }));
  };

  const updateComponentQty = (productId: string, qty: number) => {
    if (qty <= 0) return;
    setForm(f => ({
      ...f,
      components: f.components.map(c =>
        c.componentProductId === productId ? { ...c, quantity: qty } : c,
      ),
    }));
  };

  const computedPrice = form.components.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  const handleSubmit = () => {
    onSave({
      name: form.name,
      sku: form.sku || undefined,
      category: form.category || null,
      description: form.description || null,
      minStockLevel: form.minStockLevel,
      components: form.components.map(c => ({
        componentProductId: c.componentProductId,
        quantity: c.quantity,
      })),
    });
  };

  const isValid = form.name.length >= 3 && form.components.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={kit ? `Editar Kit: ${kit.name}` : 'Novo Kit'}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Dados do kit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Kit *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Cama Casal Completa"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <Input
              value={form.sku}
              onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              placeholder="KIT0001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem categoria</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrição do kit..."
            />
          </div>
        </div>

        {/* Componentes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Componentes * <span className="text-gray-400 font-normal">({form.components.length})</span>
            </label>
            <button
              type="button"
              onClick={() => setShowComponentSearch(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FiPlus size={14} /> Adicionar
            </button>
          </div>

          {showComponentSearch && (
            <div className="mb-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  autoFocus
                  type="text"
                  value={componentSearch}
                  onChange={e => setComponentSearch(e.target.value)}
                  placeholder="Buscar produto por nome ou SKU..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg shadow mt-1 max-h-40 overflow-y-auto">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addComponent(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-background border-b last:border-0 flex justify-between items-center"
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="text-xs text-gray-400 ml-2">{p.sku}</span>}
                      </div>
                      <span className="text-primary font-semibold text-xs ml-2 shrink-0">
                        R$ {parseFloat(p.price.toString()).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.components.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-4 border border-dashed border-gray-200 rounded-lg">
              Nenhum componente adicionado
            </p>
          ) : (
            <div className="space-y-2">
              {form.components.map(c => (
                <div key={c.componentProductId} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.componentName}</p>
                    {c.componentSku && (
                      <p className="text-xs text-gray-400">{c.componentSku}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateComponentQty(c.componentProductId, c.quantity - 1)}
                      className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{c.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateComponentQty(c.componentProductId, c.quantity + 1)}
                      className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 w-20 text-right shrink-0">
                    R$ {(c.unitPrice * c.quantity).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeComponent(c.componentProductId)}
                    className="text-red-400 hover:text-red-600 p-1 shrink-0"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preço computado */}
        {form.components.length > 0 && (
          <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
            <span className="text-sm font-medium text-gray-700">Preço total do kit:</span>
            <span className="text-lg font-bold text-primary">R$ {computedPrice.toFixed(2)}</span>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            loading={isSaving}
            disabled={!isValid || isSaving}
            className="flex-1"
          >
            {kit ? 'Salvar alterações' : 'Criar Kit'}
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={isSaving}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
};
