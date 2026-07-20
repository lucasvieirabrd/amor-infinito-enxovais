import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiTruck, FiSearch, FiCheckCircle, FiClock, FiPackage } from 'react-icons/fi';
import api from '../../services/api';

interface DeliveryItem {
  quantity: number;
  productName: string;
  productDescription: string | null;
}

interface Delivery {
  id: string;
  saleNumber: string;
  saleDate: string;
  status: 'pending' | 'delivered';
  deliveryType: 'com_montagem' | 'sem_montagem' | null;
  deliveredAt: string | null;
  customerName: string;
  customerPhone: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  items: DeliveryItem[];
}

interface DeliveriesResponse {
  data: Delivery[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatAddress(d: Delivery): string {
  const parts = [
    d.addressStreet && d.addressNumber ? `${d.addressStreet}, ${d.addressNumber}` : d.addressStreet,
    d.addressComplement,
    d.addressNeighborhood,
    d.addressCity,
  ].filter(Boolean);
  return parts.join(' — ') || 'Endereço não informado';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export const Deliveries: React.FC = () => {
  const [tab, setTab] = useState<'pending' | 'delivered'>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [delivering, setDelivering] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const LIMIT = 12;

  const { data, isLoading } = useQuery<DeliveriesResponse>({
    queryKey: ['deliveries', tab, search, page],
    queryFn: async () => {
      const res = await api.get('/deliveries', {
        params: { status: tab, search: search || undefined, page, limit: LIMIT },
      });
      return res.data;
    },
  });

  const deliverMutation = useMutation({
    mutationFn: ({ id, deliveryType }: { id: string; deliveryType: 'com_montagem' | 'sem_montagem' }) =>
      api.patch(`/deliveries/${id}/deliver`, { deliveryType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      setDelivering(null);
    },
    onError: () => {
      alert('Erro ao registrar entrega.');
      setDelivering(null);
    },
  });

  const handleDeliver = (id: string, type: 'com_montagem' | 'sem_montagem') => {
    setDelivering(id);
    deliverMutation.mutate({ id, deliveryType: type });
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const rows = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FiTruck size={24} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Entregas</h1>
          <p className="text-sm text-gray-500">Controle de entrega e montagem de móveis</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        <button
          onClick={() => { setTab('pending'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FiClock size={15} />
          Pendentes
          {tab === 'pending' && data && (
            <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {data.total}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab('delivered'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'delivered'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FiCheckCircle size={15} />
          Entregues
          {tab === 'delivered' && data && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {data.total}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Buscar por nome do cliente..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (e.target.value === '') { setSearch(''); setPage(1); }
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:opacity-90"
        >
          Buscar
        </button>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FiPackage size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhuma entrega {tab === 'pending' ? 'pendente' : 'registrada'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((delivery) => (
            <div
              key={delivery.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{delivery.customerName}</p>
                  <p className="text-sm text-gray-500">{delivery.customerPhone}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-primary font-semibold">{delivery.saleNumber}</span>
                  <p className="text-xs text-gray-400">{formatDate(delivery.saleDate)}</p>
                </div>
              </div>

              {/* Address */}
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                📍 {formatAddress(delivery)}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Itens da venda</p>
                <ul className="space-y-0.5">
                  {delivery.items.map((item, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      <span className="font-medium">{item.quantity}×</span>{' '}
                      {item.productName}
                      {item.productDescription && (
                        <span className="text-gray-400"> — {item.productDescription}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions / Status */}
              {delivery.status === 'pending' ? (
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => handleDeliver(delivery.id, 'com_montagem')}
                    disabled={delivering === delivery.id}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {delivering === delivery.id ? '...' : '🔧 Com montagem'}
                  </button>
                  <button
                    onClick={() => handleDeliver(delivery.id, 'sem_montagem')}
                    disabled={delivering === delivery.id}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {delivering === delivery.id ? '...' : '📦 Sem montagem'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <FiCheckCircle size={15} />
                  <span>
                    {delivery.deliveryType === 'com_montagem' ? 'Entregue com montagem' : 'Entregue sem montagem'}
                    {delivery.deliveredAt && ` · ${formatDate(delivery.deliveredAt)}`}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-600">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
