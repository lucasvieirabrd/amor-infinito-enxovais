import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiRefreshCw, FiAlertTriangle, FiPlus, FiBox } from 'react-icons/fi';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  quantity: number;
  minStockLevel: number;
}

export const Products: React.FC = () => {
  const [search, setSearch] = useState('');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Produtos / Estoque</h2>
          <p className="text-gray-600">Controle integrado com Google Sheets</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center justify-center px-4 py-2 border border-primary-600 text-primary-600 font-bold rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
          >
            <FiRefreshCw className={`mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> 
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Planilha'}
          </button>
          <button className="btn-primary flex items-center justify-center">
            <FiPlus className="mr-2" /> Novo Produto
          </button>
        </div>
      </div>

      {/* Barra de Busca e Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar por nome ou SKU..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-center">
          <FiAlertTriangle className="text-orange-500 mr-3" size={24} />
          <div>
            <p className="text-sm font-bold text-orange-800">Atenção ao Estoque</p>
            <p className="text-xs text-orange-700">
              {products?.filter(p => p.quantity <= p.minStockLevel).length || 0} produtos abaixo do nível mínimo.
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Produtos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12">Carregando estoque...</div>
        ) : products?.map((product) => (
          <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <FiBox className="text-gray-400" size={20} />
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  product.quantity <= product.minStockLevel 
                    ? 'bg-red-100 text-red-600' 
                    : 'bg-green-100 text-green-600'
                }`}>
                  {product.quantity} em estoque
                </span>
              </div>
              
              <h4 className="font-bold text-gray-800 mb-1 truncate">{product.name}</h4>
              <p className="text-xs text-gray-500 mb-4">SKU: {product.sku}</p>
              
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-gray-400">Preço de Venda</p>
                  <p className="text-lg font-bold text-primary-600">
                    R$ {parseFloat(product.price.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <button className="text-sm font-medium text-gray-600 hover:text-primary-600">
                  Editar
                </button>
              </div>
            </div>
            
            {product.quantity <= product.minStockLevel && (
              <div className="bg-red-50 px-5 py-2 border-t border-red-100">
                <p className="text-[10px] font-bold text-red-600 uppercase">Reposição Necessária</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
