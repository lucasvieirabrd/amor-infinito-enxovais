import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FiSearch, FiFilter, FiChevronLeft, FiChevronRight, FiEye, FiTrash2, FiAlertCircle, FiLoader,
  FiDownload, FiFileText,
} from 'react-icons/fi';
import { Button, Card, Badge, Modal, Loading } from '../../components/ui';
import { format, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '../../hooks/useAuth';

interface SaleItem {
  id: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
}

interface Installment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  originalAmount: number | string;
  paidAmount: number | string;
  paymentDate?: string;
  status: 'pending' | 'paid' | 'overdue' | 'canceled' | 'partial';
}

interface Sale {
  id: string;
  saleNumber: string;
  saleDate?: string;
  createdAt: string;
  customer?: { name: string };
  customerName?: string;
  paymentMethod: 'cash' | 'credit_card' | 'installment' | 'renegotiation';
  totalAmount: number;
  installmentsCount?: number;
  status: 'completed' | 'canceled';
  items?: SaleItem[];
  installments?: Installment[];
  recordType?: 'sale' | 'renegotiation';
  isRenegotiated?: boolean;
  originalAmount?: number;
  discount?: number;
  sellerName?: string | null;
  sellerId?: string | null;
}

interface SellerOption {
  id: string;
  name: string;
}

interface RenegotiationDetail {
  id: string;
  renNumber: string;
  customerId: string;
  customerName?: string;
  originalAmount: number | string;
  newAmount: number | string;
  discount: number | string;
  installmentsCount: number;
  createdAt: string;
  installments: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    originalAmount: number | string;
    paidAmount: number | string;
    paymentDate?: string;
    status: string;
  }[];
}

export const SalesHistory: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'credit_card' | 'installment'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'sales' | 'imported' | 'renegotiation'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [carneLoading, setCarneLoading] = useState(false);
  const [promissoriaLoading, setPromissoriaLoading] = useState(false);
  const [ordemLoading, setOrdemLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, { amount: string; dueDate: string }>>({});
  const [markedForDelete, setMarkedForDelete] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{ type: 'installment' | 'entry'; number: string; amount: string; dueDate: string } | null>(null);
  const [pendingAdds, setPendingAdds] = useState<{ installmentNumber: number; amount: string; dueDate: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [selectedRen, setSelectedRen] = useState<RenegotiationDetail | null>(null);
  const [showRenDetails, setShowRenDetails] = useState(false);
  const [renDetailsLoading, setRenDetailsLoading] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');

  const [showSellerReport, setShowSellerReport] = useState(false);
  const [sellerReportStart, setSellerReportStart] = useState('');
  const [sellerReportEnd, setSellerReportEnd] = useState('');
  const [sellerReportSellerId, setSellerReportSellerId] = useState('');
  const [sellerReportCommission, setSellerReportCommission] = useState('5');
  const [sellerReportFormat, setSellerReportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [sellerReportLoading, setSellerReportLoading] = useState(false);

  const { data: sellerOptions } = useQuery({
    queryKey: ['sellers-list'],
    queryFn: async () => {
      const res = await api.get('/sellers');
      return res.data as SellerOption[];
    },
  });

  const handleDownloadCarne = async (saleId: string, saleNumber: string) => {
    setCarneLoading(true);
    try {
      const response = await api.get(`/sales/${saleId}/carne`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `carne-${saleNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar carnê.');
    } finally {
      setCarneLoading(false);
    }
  };

  const handlePrintPromissoria = async (saleId: string) => {
    setPromissoriaLoading(true);
    try {
      const response = await api.get(`/sales/${saleId}/promissoria`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      alert('Erro ao gerar promissória.');
    } finally {
      setPromissoriaLoading(false);
    }
  };

  const handlePrintOrdem = async (saleId: string) => {
    setOrdemLoading(true);
    try {
      const response = await api.get(`/sales/${saleId}/ordem`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      alert('Erro ao gerar ordem de venda.');
    } finally {
      setOrdemLoading(false);
    }
  };

  const openSellerReport = () => {
    const now = new Date();
    setSellerReportStart(format(startOfMonth(now), 'yyyy-MM-dd'));
    setSellerReportEnd(format(endOfMonth(now), 'yyyy-MM-dd'));
    setSellerReportSellerId('');
    setSellerReportCommission('5');
    setSellerReportFormat('pdf');
    setShowSellerReport(true);
  };

  const handleGenerateSellerReport = async () => {
    setSellerReportLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: sellerReportStart,
        endDate: sellerReportEnd,
        commissionPercent: sellerReportCommission,
        format: sellerReportFormat,
        ...(sellerReportSellerId && { sellerId: sellerReportSellerId }),
      });
      const response = await api.get(`/reports/sellers?${params}`, { responseType: 'blob' });
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const isExcel = sellerReportFormat === 'excel';
      const mimeType = isExcel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      const ext = isExcel ? 'xlsx' : 'pdf';
      const url = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-vendedores-${dateStr}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar relatório de vendedores.');
    } finally {
      setSellerReportLoading(false);
    }
  };

  const limit = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['sales-history', page, search, paymentFilter, originFilter, startDate, endDate, sellerFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
        ...(paymentFilter !== 'all' && { paymentMethod: paymentFilter }),
        ...(originFilter !== 'all' && { origin: originFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sellerFilter && { sellerId: sellerFilter }),
      });
      const response = await api.get(`/sales/history?${params}`);
      return response.data;
    },
  });

  const handleViewDetails = async (sale: Sale) => {
    if (sale.recordType === 'renegotiation') {
      setShowRenDetails(true);
      setRenDetailsLoading(true);
      try {
        const { data } = await api.get(`/renegotiations/${sale.id}`);
        setSelectedRen(data);
      } finally {
        setRenDetailsLoading(false);
      }
      return;
    }
    setSelectedSale(sale);
    setShowDetails(true);
    setDetailsLoading(true);
    try {
      const { data } = await api.get(`/sales/${sale.id}`);
      setSelectedSale(data);
    } finally {
      setDetailsLoading(false);
    }
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
      case 'renegotiation':
        return 'Renegociação';
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
      case 'renegotiation':
        return 'error';
      default:
        return 'info';
    }
  };

  const getInstallmentStatusStyle = (inst: Installment) => {
    switch (inst.status) {
      case 'paid':
        return { label: 'Paga', bgClass: 'bg-green-50', textClass: 'text-green-700' };
      case 'overdue':
        return { label: 'Atrasada', bgClass: 'bg-red-50', textClass: 'text-red-700' };
      case 'canceled':
        return { label: 'Cancelada', bgClass: 'bg-gray-100', textClass: 'text-gray-400' };
      case 'partial':
        return { label: 'Parcial', bgClass: 'bg-orange-50', textClass: 'text-orange-600' };
      default:
        if (isToday(new Date(inst.dueDate))) {
          return { label: 'Vencendo hoje', bgClass: 'bg-orange-50', textClass: 'text-orange-600' };
        }
        return { label: 'Pendente', bgClass: 'bg-gray-50', textClass: 'text-gray-500' };
    }
  };

  const toDateInput = (dateStr: string) => {
    try { return format(new Date(dateStr), 'yyyy-MM-dd'); } catch { return ''; }
  };

  const exitEditMode = () => {
    setIsEditMode(false);
    setEditValues({});
    setMarkedForDelete(new Set());
    setDeleteConfirmId(null);
    setAddForm(null);
    setPendingAdds([]);
  };

  const enterEditMode = () => {
    if (!selectedSale?.installments) return;
    const init: Record<string, { amount: string; dueDate: string }> = {};
    selectedSale.installments.forEach(inst => {
      init[inst.id] = {
        amount: parseFloat(inst.originalAmount.toString()).toFixed(2),
        dueDate: toDateInput(inst.dueDate),
      };
    });
    setEditValues(init);
    setMarkedForDelete(new Set());
    setDeleteConfirmId(null);
    setAddForm(null);
    setPendingAdds([]);
    setIsEditMode(true);
  };

  const computeEditedTotal = () => {
    if (!selectedSale?.installments) return 0;
    let total = 0;
    selectedSale.installments.forEach(inst => {
      if (markedForDelete.has(inst.id)) return;
      const ev = editValues[inst.id];
      total += ev ? (parseFloat(ev.amount) || 0) : parseFloat(inst.originalAmount.toString());
    });
    pendingAdds.forEach(a => { total += parseFloat(a.amount) || 0; });
    return total;
  };

  const handleSaveAll = async () => {
    if (!selectedSale) return;
    setEditSaving(true);
    try {
      for (const id of markedForDelete) {
        await api.delete(`/installments/${id}`);
      }
      for (const inst of selectedSale.installments ?? []) {
        if (markedForDelete.has(inst.id) || inst.status === 'paid') continue;
        const ev = editValues[inst.id];
        if (!ev) continue;
        const origAmount = parseFloat(inst.originalAmount.toString());
        const origDate = toDateInput(inst.dueDate);
        const amountChanged = Math.abs(parseFloat(ev.amount) - origAmount) > 0.001;
        const dateChanged = ev.dueDate !== origDate;
        if (amountChanged || dateChanged) {
          await api.put(`/installments/${inst.id}`, {
            ...(amountChanged && { originalAmount: parseFloat(ev.amount) }),
            ...(dateChanged && { dueDate: ev.dueDate }),
          });
        }
      }
      for (const add of pendingAdds) {
        await api.post(`/sales/${selectedSale.id}/installments`, {
          installmentNumber: add.installmentNumber,
          amount: parseFloat(add.amount),
          dueDate: add.dueDate,
        });
      }
      const { data } = await api.get(`/sales/${selectedSale.id}`);
      setSelectedSale(data);
      exitEditMode();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erro ao salvar alterações');
    } finally {
      setEditSaving(false);
    }
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
    exitEditMode();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Histórico de Vendas</h1>
        <p className="text-gray-600 mt-1">Consulte todas as vendas realizadas</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FiFilter size={18} className="text-gray-500" />
            <span className="font-semibold text-gray-900">Filtros</span>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="Buscar por cliente ou nº venda..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-[44px] pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors w-56"
              />
            </div>

            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value as any);
                setPage(1);
              }}
              disabled={originFilter === 'renegotiation'}
              className="h-[44px] pl-3 pr-8 min-w-[180px] border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="all">Todas as formas</option>
              <option value="cash">À Vista</option>
              <option value="credit_card">Cartão</option>
              <option value="installment">Crediário</option>
            </select>

            <select
              value={originFilter}
              onChange={(e) => {
                const v = e.target.value as any;
                setOriginFilter(v);
                if (v === 'renegotiation') setPaymentFilter('all');
                setPage(1);
              }}
              className="h-[44px] pl-3 pr-8 min-w-[180px] border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors"
            >
              <option value="all">Todas as origens</option>
              <option value="sales">Vendas</option>
              <option value="imported">Importados</option>
              <option value="renegotiation">Renegociações</option>
            </select>

            <select
              value={sellerFilter}
              onChange={(e) => { setSellerFilter(e.target.value); setPage(1); }}
              className="h-[44px] pl-3 pr-8 min-w-[160px] border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors"
            >
              <option value="">Todos os vendedores</option>
              {sellerOptions?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <input
              type="date"
              placeholder="Data inicial"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="h-[44px] px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors"
            />

            <input
              type="date"
              placeholder="Data final"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="h-[44px] px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors"
            />

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setPaymentFilter('all');
                setOriginFilter('all');
                setSellerFilter('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="h-[44px]"
            >
              Limpar Filtros
            </Button>

            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={openSellerReport}
                className="h-[44px] flex items-center gap-2"
              >
                <FiFileText size={16} />
                Relatório de Vendedores
              </Button>
            )}
          </div>
        </div>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendedor</th>
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
                      {sale.customer?.name || sale.customerName || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {sale.sellerName || <span className="text-gray-400">—</span>}
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
                      <div className="flex flex-col gap-1 items-start">
                        {sale.recordType === 'renegotiation' ? (
                          <Badge variant="error">Renegociação</Badge>
                        ) : sale.status === 'completed' ? (
                          <Badge variant="success">Concluída</Badge>
                        ) : (
                          <Badge variant="error">Cancelada</Badge>
                        )}
                        {sale.isRenegotiated && (
                          <span className="text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">Renegociada</span>
                        )}
                      </div>
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
                        {sale.recordType !== 'renegotiation' && (
                          sale.status === 'completed' ? (
                            <button
                              onClick={() => handleDeleteClick(sale.id)}
                              className="text-error hover:bg-error hover:bg-opacity-10 p-2 rounded-lg transition-colors"
                              title="Cancelar venda"
                            >
                              <FiTrash2 size={18} />
                            </button>
                          ) : (
                            <button
                              disabled
                              className="text-gray-400 p-2 rounded-lg cursor-not-allowed"
                              title="Venda cancelada"
                            >
                              <FiTrash2 size={18} />
                            </button>
                          )
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
        onClose={handleCloseDetails}
        size="2xl"
      >
        {selectedSale && (
          <div className="space-y-6">
            {detailsLoading ? (
              <div className="flex justify-center py-8">
                <FiLoader size={24} className="animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Informações básicas */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 font-semibold uppercase">Nº Venda</p>
                    <p className="text-lg font-bold text-gray-900">{selectedSale.saleNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold uppercase">Data</p>
                    <p className="text-lg font-bold text-gray-900">
                      {format(new Date(selectedSale.saleDate || selectedSale.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold uppercase">Cliente</p>
                    <p className="text-lg font-bold text-gray-900">
                      {selectedSale.customerName || selectedSale.customer?.name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold uppercase">Forma de Pagamento</p>
                    <Badge variant={getPaymentMethodVariant(selectedSale.paymentMethod)}>
                      {getPaymentMethodLabel(selectedSale.paymentMethod)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 font-semibold uppercase">Vendedor</p>
                    <p className="text-lg font-bold text-gray-900">{(selectedSale as any).sellerName || '—'}</p>
                  </div>
                </div>

                {/* Detalhamento da forma de pagamento */}
                <div className="p-4 bg-background rounded-lg border border-gray-100">
                  {selectedSale.paymentMethod === 'cash' && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        À vista —{' '}
                        <span className="text-gray-900">
                          R$ {parseFloat(selectedSale.totalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Data: {format(new Date(selectedSale.saleDate || selectedSale.createdAt), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  )}

                  {selectedSale.paymentMethod === 'credit_card' && (
                    <div>
                      {selectedSale.installmentsCount && selectedSale.installmentsCount > 1 ? (
                        <>
                          <p className="text-sm font-semibold text-gray-700">
                            Cartão —{' '}
                            <span className="text-gray-900">
                              {selectedSale.installmentsCount}x de R${' '}
                              {(parseFloat(selectedSale.totalAmount.toString()) / selectedSale.installmentsCount)
                                .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Total: R$ {parseFloat(selectedSale.totalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-gray-700">
                          Cartão à vista —{' '}
                          <span className="text-gray-900">
                            R$ {parseFloat(selectedSale.totalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {selectedSale.paymentMethod === 'installment' && (
                    <div className="space-y-1">
                      {selectedSale.installments?.find(i => i.installmentNumber === 0) && (() => {
                        const entrada = selectedSale.installments!.find(i => i.installmentNumber === 0)!;
                        return (
                          <p className="text-sm text-gray-700">
                            <span className="font-semibold">Entrada:</span>{' '}
                            R$ {parseFloat(entrada.originalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {entrada.paymentDate && (
                              <span className="text-gray-500">
                                {' '}em {format(new Date(entrada.paymentDate), 'dd/MM/yyyy')}
                              </span>
                            )}
                          </p>
                        );
                      })()}
                      <p className="text-sm font-semibold text-gray-700">
                        Crediário em {selectedSale.installments?.filter(i => i.installmentNumber > 0).length ?? 0}x parcelas
                      </p>
                    </div>
                  )}
                </div>

                {/* Produtos */}
                {selectedSale.items && selectedSale.items.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Produtos</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                            <th className="pb-2 text-center text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                            <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase">Unitário</th>
                            <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedSale.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-2 pr-4 font-medium text-gray-900">
                                {item.productName || `Produto ${idx + 1}`}
                              </td>
                              <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                              <td className="py-2 text-right text-gray-600">
                                R$ {parseFloat(item.unitPrice.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 text-right font-semibold text-gray-900">
                                R$ {parseFloat(item.totalPrice.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Parcelas do crediário */}
                {selectedSale.paymentMethod === 'installment' && selectedSale.installments && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">Parcelas do Crediário</h4>
                      {isAdmin && !isEditMode && (
                        <button
                          onClick={enterEditMode}
                          className="text-xs font-semibold text-primary border border-primary border-opacity-30 px-3 py-1 rounded-lg hover:bg-primary hover:bg-opacity-5 transition-colors"
                        >
                          ✏️ Editar Parcelas
                        </button>
                      )}
                    </div>

                    {selectedSale.installments.length > 0 && (
                      <div className={`space-y-2 overflow-y-auto pr-1 ${isEditMode ? 'max-h-96' : 'max-h-72'}`}>
                        {(() => {
                          const sorted = [...selectedSale.installments!].sort((a, b) => a.installmentNumber - b.installmentNumber);
                          const regularCount = sorted.filter(i => i.installmentNumber > 0).length;
                          return sorted.map((inst) => {
                            const isEntry = inst.installmentNumber === 0;
                            const isDeleted = markedForDelete.has(inst.id);
                            const isPaid = inst.status === 'paid';
                            const ev = editValues[inst.id] ?? {
                              amount: parseFloat(inst.originalAmount.toString()).toFixed(2),
                              dueDate: toDateInput(inst.dueDate),
                            };

                            if (isEntry) {
                              return (
                                <div key={inst.id} className={`flex justify-between items-center p-3 rounded-lg border ${isDeleted ? 'opacity-40 bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'}`}>
                                  <div>
                                    <p className="font-semibold text-amber-800 text-sm">Entrada</p>
                                    {inst.paymentDate && (
                                      <p className="text-xs text-amber-600">Paga em {format(new Date(inst.paymentDate), 'dd/MM/yyyy')}</p>
                                    )}
                                    {isEditMode && isDeleted && <p className="text-xs text-red-500 font-semibold">Marcada para remoção</p>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-right space-y-1">
                                      <p className="font-bold text-amber-900 text-sm">R$ {parseFloat(inst.originalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Paga</span>
                                    </div>
                                    {isEditMode && !isDeleted && (
                                      deleteConfirmId === inst.id ? (
                                        <div className="flex gap-1 items-center">
                                          <span className="text-xs text-red-600 font-semibold">Confirmar?</span>
                                          <button onClick={() => { setMarkedForDelete(prev => new Set([...prev, inst.id])); setDeleteConfirmId(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">Sim</button>
                                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs border border-gray-300 px-2 py-0.5 rounded">Não</button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setDeleteConfirmId(inst.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Remover entrada">🗑</button>
                                      )
                                    )}
                                    {isEditMode && isDeleted && (
                                      <button onClick={() => setMarkedForDelete(prev => { const s = new Set(prev); s.delete(inst.id); return s; })} className="p-1 text-gray-500 hover:text-gray-700 rounded" title="Desfazer">↩</button>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            const { label, bgClass, textClass } = getInstallmentStatusStyle(inst);
                            return (
                              <div key={inst.id} className={`p-3 rounded-lg border transition-colors ${isDeleted ? 'opacity-40 bg-gray-50 border-gray-200' : isEditMode && !isPaid ? 'bg-background border-primary border-opacity-30' : 'bg-background border-gray-100'}`}>
                                {isEditMode && !isPaid && !isDeleted ? (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="font-semibold text-gray-900 text-sm">Parcela {inst.installmentNumber}/{regularCount}</p>
                                      {deleteConfirmId === inst.id ? (
                                        <div className="flex gap-1 items-center">
                                          <span className="text-xs text-red-600 font-semibold">Confirmar?</span>
                                          <button onClick={() => { setMarkedForDelete(prev => new Set([...prev, inst.id])); setDeleteConfirmId(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">Sim</button>
                                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs border border-gray-300 px-2 py-0.5 rounded">Não</button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setDeleteConfirmId(inst.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Remover parcela">🗑</button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-xs text-gray-500 block mb-0.5">Valor (R$)</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          value={ev.amount}
                                          onChange={e => setEditValues(prev => ({ ...prev, [inst.id]: { ...ev, amount: e.target.value } }))}
                                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-500 block mb-0.5">Vencimento</label>
                                        <input
                                          type="date"
                                          value={ev.dueDate}
                                          onChange={e => setEditValues(prev => ({ ...prev, [inst.id]: { ...ev, dueDate: e.target.value } }))}
                                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <p className={`font-semibold text-sm ${isDeleted ? 'text-gray-400' : 'text-gray-900'}`}>
                                        Parcela {inst.installmentNumber}/{regularCount}
                                        {isDeleted && <span className="ml-1 text-xs text-red-400">(removida)</span>}
                                      </p>
                                      <p className="text-xs text-gray-500">Venc.: {format(new Date(inst.dueDate), 'dd/MM/yyyy')}</p>
                                      {inst.status === 'paid' && inst.paymentDate && (
                                        <p className="text-xs text-green-600">Paga em {format(new Date(inst.paymentDate), 'dd/MM/yyyy')}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-right space-y-1">
                                        <p className={`font-bold text-sm ${isDeleted ? 'text-gray-400' : 'text-gray-900'}`}>
                                          R$ {parseFloat(inst.originalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${isDeleted ? 'bg-gray-100 text-gray-400' : `${bgClass} ${textClass}`}`}>
                                          {isDeleted ? 'Removida' : label}
                                        </span>
                                      </div>
                                      {isEditMode && isDeleted && (
                                        <button onClick={() => setMarkedForDelete(prev => { const s = new Set(prev); s.delete(inst.id); return s; })} className="p-1 text-gray-500 hover:text-gray-700 rounded" title="Desfazer remoção">↩</button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}

                        {isEditMode && pendingAdds.map((add, idx) => (
                          <div key={`new-${idx}`} className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-semibold text-blue-800 text-sm">
                                {add.installmentNumber === 0 ? '↳ Entrada (nova)' : `↳ Parcela ${add.installmentNumber} (nova)`}
                              </p>
                              <button onClick={() => setPendingAdds(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                            </div>
                            <p className="text-xs text-blue-600">
                              R$ {(parseFloat(add.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — {add.dueDate ? format(new Date(add.dueDate + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isEditMode && (
                      <div className="mt-3 space-y-3">
                        {addForm ? (
                          <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
                            <p className="text-sm font-semibold text-blue-800">{addForm.type === 'entry' ? 'Nova Entrada' : 'Nova Parcela'}</p>
                            <div className="grid grid-cols-3 gap-2">
                              {addForm.type === 'installment' && (
                                <div>
                                  <label className="text-xs text-gray-500 block mb-0.5">Número</label>
                                  <input type="number" min="1" value={addForm.number} onChange={e => setAddForm(prev => prev ? { ...prev, number: e.target.value } : null)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary" />
                                </div>
                              )}
                              <div>
                                <label className="text-xs text-gray-500 block mb-0.5">Valor (R$)</label>
                                <input type="number" step="0.01" min="0.01" value={addForm.amount} onChange={e => setAddForm(prev => prev ? { ...prev, amount: e.target.value } : null)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-0.5">{addForm.type === 'entry' ? 'Data Pgto.' : 'Vencimento'}</label>
                                <input type="date" value={addForm.dueDate} onChange={e => setAddForm(prev => prev ? { ...prev, dueDate: e.target.value } : null)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-primary" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (!addForm.amount || !addForm.dueDate) return;
                                  if (addForm.type === 'installment' && !addForm.number) return;
                                  setPendingAdds(prev => [...prev, {
                                    installmentNumber: addForm.type === 'entry' ? 0 : parseInt(addForm.number),
                                    amount: addForm.amount,
                                    dueDate: addForm.dueDate,
                                  }]);
                                  setAddForm(null);
                                }}
                                className="text-xs bg-primary text-white px-3 py-1.5 rounded font-semibold hover:opacity-90 transition-opacity"
                              >
                                Adicionar
                              </button>
                              <button onClick={() => setAddForm(null)} className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setAddForm({ type: 'entry', number: '0', amount: '', dueDate: '' })} className="text-xs border border-amber-300 text-amber-700 px-3 py-1.5 rounded hover:bg-amber-50 transition-colors font-semibold">+ Adicionar Entrada</button>
                            <button onClick={() => setAddForm({ type: 'installment', number: '', amount: '', dueDate: '' })} className="text-xs border border-blue-300 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 transition-colors font-semibold">+ Adicionar Parcela</button>
                          </div>
                        )}

                        {(() => {
                          const editedTotal = computeEditedTotal();
                          const saleTotal = parseFloat(selectedSale!.totalAmount.toString());
                          const diff = Math.abs(editedTotal - saleTotal);
                          const matches = diff < 0.02;
                          return (
                            <div className={`p-3 rounded-lg border text-sm ${matches ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                              <div className="flex justify-between items-center">
                                <span className={`font-semibold ${matches ? 'text-green-700' : 'text-amber-700'}`}>Total das parcelas:</span>
                                <span className={`font-bold ${matches ? 'text-green-800' : 'text-amber-800'}`}>R$ {editedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between items-center mt-0.5">
                                <span className="text-gray-500 text-xs">Total da venda:</span>
                                <span className="text-gray-700 text-xs font-semibold">R$ {saleTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              {!matches && <p className="text-xs text-amber-600 mt-1 font-semibold">⚠️ Diferença de R$ {diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — valores não batem com o total da venda.</p>}
                            </div>
                          );
                        })()}

                        <div className="flex gap-2">
                          <button onClick={handleSaveAll} disabled={editSaving} className="flex-1 py-2 bg-primary text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {editSaving ? 'Salvando...' : 'Salvar Alterações'}
                          </button>
                          <button onClick={exitEditMode} disabled={editSaving} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-50 disabled:opacity-50">
                            Cancelar Edição
                          </button>
                        </div>
                      </div>
                    )}
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
              </>
            )}

            <div className="flex gap-3 flex-wrap">
              {selectedSale.paymentMethod === 'installment' && (
                <Button
                  variant="danger"
                  onClick={() => handleDownloadCarne(selectedSale.id, selectedSale.saleNumber)}
                  disabled={carneLoading || promissoriaLoading || ordemLoading}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <FiDownload size={16} />
                  {carneLoading ? 'Gerando...' : 'Gerar Carnê'}
                </Button>
              )}
              {selectedSale.paymentMethod === 'installment' && (
                <Button
                  variant="secondary"
                  onClick={() => handlePrintPromissoria(selectedSale.id)}
                  disabled={carneLoading || promissoriaLoading || ordemLoading}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <FiDownload size={16} />
                  {promissoriaLoading ? 'Gerando...' : 'Promissória'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => handlePrintOrdem(selectedSale.id)}
                disabled={carneLoading || promissoriaLoading || ordemLoading}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <FiDownload size={16} />
                {ordemLoading ? 'Gerando...' : 'Imprimir Ordem'}
              </Button>
              <Button variant="secondary" onClick={() => setShowDetails(false)} className="flex-1">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Renegotiation Details Modal */}
      <Modal
        isOpen={showRenDetails}
        title={selectedRen ? `Renegociação ${selectedRen.renNumber}` : 'Detalhes da Renegociação'}
        onClose={() => { setShowRenDetails(false); setSelectedRen(null); }}
        size="2xl"
      >
        {renDetailsLoading ? (
          <div className="flex justify-center py-8">
            <FiLoader size={24} className="animate-spin text-primary" />
          </div>
        ) : selectedRen && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Nº Renegociação</p>
                <p className="text-lg font-bold text-gray-900">{selectedRen.renNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Data</p>
                <p className="text-lg font-bold text-gray-900">
                  {format(new Date(selectedRen.createdAt), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Cliente</p>
                <p className="text-lg font-bold text-gray-900">{selectedRen.customerName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 font-semibold uppercase">Parcelas</p>
                <p className="text-lg font-bold text-gray-900">{selectedRen.installmentsCount}x</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-semibold">Valor Original</p>
                <p className="text-base font-bold text-gray-700 mt-1">
                  R$ {parseFloat(selectedRen.originalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3 bg-primary bg-opacity-5 rounded-lg border border-primary border-opacity-20">
                <p className="text-xs text-primary uppercase font-semibold">Novo Valor</p>
                <p className="text-base font-bold text-primary mt-1">
                  R$ {parseFloat(selectedRen.newAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              {parseFloat(selectedRen.discount.toString()) > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs text-green-600 uppercase font-semibold">Desconto</p>
                  <p className="text-base font-bold text-green-700 mt-1">
                    R$ {parseFloat(selectedRen.discount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>

            {selectedRen.installments && selectedRen.installments.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Parcelas do Novo Acordo</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {[...selectedRen.installments]
                    .sort((a, b) => a.installmentNumber - b.installmentNumber)
                    .map((inst) => {
                      const isEntry = inst.installmentNumber === 0;
                      const regularCount = selectedRen.installments.filter(i => i.installmentNumber > 0).length;
                      const statusStyle = (() => {
                        switch (inst.status) {
                          case 'paid': return { label: 'Paga', bg: 'bg-green-50', text: 'text-green-700' };
                          case 'canceled': return { label: 'Cancelada', bg: 'bg-gray-100', text: 'text-gray-400' };
                          default: return { label: 'Pendente', bg: 'bg-gray-50', text: 'text-gray-500' };
                        }
                      })();
                      return (
                        <div key={inst.id} className={`flex justify-between items-center p-3 rounded-lg border ${isEntry ? 'bg-amber-50 border-amber-200' : 'bg-background border-gray-100'}`}>
                          <div>
                            <p className={`font-semibold text-sm ${isEntry ? 'text-amber-800' : 'text-gray-900'}`}>
                              {isEntry ? 'Entrada' : `Parcela ${inst.installmentNumber}/${regularCount}`}
                            </p>
                            <p className="text-xs text-gray-500">
                              Venc.: {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                            </p>
                            {inst.status === 'paid' && inst.paymentDate && (
                              <p className="text-xs text-green-600">Paga em {format(new Date(inst.paymentDate), 'dd/MM/yyyy')}</p>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <p className="font-bold text-sm text-gray-900">
                              R$ {parseFloat(inst.originalAmount.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                              {statusStyle.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setShowRenDetails(false); setSelectedRen(null); }} className="flex-1">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Seller Report Modal */}
      <Modal
        isOpen={showSellerReport}
        title="Relatório de Vendas por Vendedor"
        onClose={() => setShowSellerReport(false)}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Data Inicial</label>
              <input
                type="date"
                value={sellerReportStart}
                onChange={e => setSellerReportStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Data Final</label>
              <input
                type="date"
                value={sellerReportEnd}
                onChange={e => setSellerReportEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendedor</label>
            <select
              value={sellerReportSellerId}
              onChange={e => setSellerReportSellerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todos os vendedores</option>
              {sellerOptions?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              Percentual de Comissão (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={sellerReportCommission}
              onChange={e => setSellerReportCommission(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Formato</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="seller-report-format"
                  value="pdf"
                  checked={sellerReportFormat === 'pdf'}
                  onChange={() => setSellerReportFormat('pdf')}
                  className="accent-primary"
                />
                <span className="text-sm font-medium text-gray-700">PDF</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="seller-report-format"
                  value="excel"
                  checked={sellerReportFormat === 'excel'}
                  onChange={() => setSellerReportFormat('excel')}
                  className="accent-primary"
                />
                <span className="text-sm font-medium text-gray-700">Excel (.xlsx)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowSellerReport(false)}
              className="flex-1"
              disabled={sellerReportLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerateSellerReport}
              className="flex-1 flex items-center justify-center gap-2"
              disabled={sellerReportLoading || !sellerReportStart || !sellerReportEnd}
            >
              <FiDownload size={16} />
              {sellerReportLoading ? 'Gerando...' : 'Gerar Relatório'}
            </Button>
          </div>
        </div>
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
