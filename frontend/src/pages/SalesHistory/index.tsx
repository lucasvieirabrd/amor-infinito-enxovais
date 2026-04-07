import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  FiSearch, FiFilter, FiChevronLeft, FiChevronRight, FiEye, FiTrash2, FiAlertCircle
} from 'react-icons/fi';
import { Button, Card, Badge, Input, Modal, Loading } from '../../components/ui';
import { format } from 'date-fns';

interface Sale {
  id: string;
  saleNumber: string;
  createdAt: string;
  customer?: { name: string };
  paymentMethod: 'cash' | 'credit_card' | 'installment';
  totalAmount: number;
  status: 'completed' | 'canceled';
  items?: any[];
  installments?: any[];
}

export const SalesHistory: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'credit_card' | 'installment'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);

  const limit = 10;

  // Buscar histórico de vendas com filtros
  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['sales-history', page, search, paymentFilter, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
        ...(paymentFilter !== 'all' && { paymentMethod: paymentFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const response = await api.get(`/sales/history?${params}`);
      return response.data;
    },
  });

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetails(true);
  };

  const handleDeleteClick = (saleId: string) => {
    setSaleToDelete(saleId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!saleToDelete) return;
    try {
      await api.delete(`/sales/${saleToDelete}`);
      setShowDeleteConfirm(false);
      setSaleToDelete(null);
      refetch();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao cancelar venda');
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'À Vista';
      case 'credit_card':
        return 'Cartão';
      case 'installment':
        return 'Crediário';
      default:
        return method;
    }
  };

  const getPaymentMethodVariant = (method: string): 'success' | 'error' | 'warning' | 'info' => {
    switch (method) {
      case 'cash':
        return 'success';
      case 'credit_card':
        return 'info';
      case 'installment':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Histórico de Vendas</h1>
        <p className="text-gray-600 mt-1">Consulte todas as vendas realizadas</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <FiFilter size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filtros</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por cliente ou nº venda..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="input-base pl-10 w-full"
              />
            </div>

            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value as any);
                setPage(1);
              }}
              className="input-base w-full"
            >
              <option value="all">Todas as formas</option>
              <option value="cash">À Vista</option>
              <option value="credit_card">Cartão</option>
              <option value="installment">Crediário</option>
            </select>

            <Input
              label="Data Inicial"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />

            <Input
              label="Data Final"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setPaymentFilter('all');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* Sales Table */}
      <Card>
        {isLoading ? (
          <Loading variant="skeleton" />
        ) : !salesData?.data || salesData.data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma venda encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nº Venda</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Forma Pagamento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salesData.data.map((sale: Sale) => (
                  <tr key={sale.id} className="hover:bg-background transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {sale.saleNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {sale.customer?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant={getPaymentMethodVariant(sale.paymentMethod)}>
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      R$ {parseFloat(sale.totalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {sale.status === 'completed' ? (
                        <Badge variant="success">Concluída</Badge>
                      ) : (
                        <Badge variant="error">Cancelada</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(sale)}
                          className="text-primary hover:bg-primary hover:bg-opacity-10 p-2 rounded-lg transition-colors"
                          title="Ver detalhes"
                        >
                          <FiEye size={18} />
                        </button>
                        {sale.status === 'completed' && (
                          <button
                            onClick={() => handleDeleteClick(sale.id)}
                            className="text-error hover:bg-error hover:bg-opacity-10 p-2 rounded-lg transition-colors"
                            title="Cancelar venda"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {salesData && salesData.total > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Mostrando {((page - 1) * limit) + 1} a {Math.min(page * limit, salesData.total)} de {salesData.total} vendas
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex items-center gap-1"
              >
                <FiChevronLeft size={18} />
                Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page * limit >= salesData.total}
                className="flex items-center gap-1"
              >
                Próxima
                <FiChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Details Modal */}
      <Modal
        isOpen={showDetails && !!selectedSale}
        title={selectedSale ? `Detalhes da Venda ${selectedSale.saleNumber}` : ''}
        onClose={() => setShowDetails(false)}
      >
        {selectedSale && (
          <div className="space-y-6">
            {/* Sale Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Nº Venda</p>
                <p className="text-lg font-bold text-gray-900">{selectedSale.saleNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Data</p>
                <p className="text-lg font-bold text-gray-900">
                  {format(new Date(selectedSale.createdAt), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Cliente</p>
                <p className="text-lg font-bold text-gray-900">{selectedSale.customer?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Forma Pagamento</p>
                <Badge variant={getPaymentMethodVariant(selectedSale.paymentMethod)}>
                  {getPaymentMethodLabel(selectedSale.paymentMethod)}
                </Badge>
              </div>
            </div>

            {/* Items */}
            {selectedSale.items && selectedSale.items.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Produtos</h4>
                <div className="space-y-2">
                  {selectedSale.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between p-3 bg-background rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">Produto {idx + 1}</p>
                        <p className="text-xs text-gray-600">Quantidade: {item.quantity}</p>
                      </div>
                      <p className="font-bold text-gray-900">
                        R$ {parseFloat(item.totalPrice || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Installments */}
            {selectedSale.installments && selectedSale.installments.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Parcelas</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedSale.installments.map((inst: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-background rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{inst.installmentNumber}ª Parcela</p>
                        <p className="text-xs text-gray-600">
                          Vencimento: {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">R$ {parseFloat(inst.originalAmount).toFixed(2)}</p>
                        <Badge variant={inst.status === 'paid' ? 'success' : inst.status === 'overdue' ? 'error' : 'warning'}>
                          {inst.status === 'paid' ? 'Paga' : inst.status === 'overdue' ? 'Atrasada' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <p className="text-lg font-bold text-gray-900">Total</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {parseFloat(selectedSale.totalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <Button variant="secondary" onClick={() => setShowDetails(false)} className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        title="Cancelar Venda"
        onClose={() => setShowDeleteConfirm(false)}
      >
          <div className="space-y-6">
            <div className="flex gap-3 p-4 bg-error bg-opacity-10 rounded-lg border border-error border-opacity-20">
              <FiAlertCircle className="text-error flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-semibold text-gray-900">Tem certeza?</p>
                <p className="text-sm text-gray-600 mt-1">
                  O estoque será revertido e as parcelas do crediário serão canceladas.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                className="flex-1"
              >
                Confirmar Cancelamento
              </Button>
            </div>
          </div>
      </Modal>
    </div>
  );
};
