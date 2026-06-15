import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FiSearch,
  FiAlertTriangle,
  FiDollarSign,
  FiRotateCcw,
  FiMessageCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiChevronUp,
  FiEdit,
  FiClock,
  FiCheckCircle,
  FiCalendar,
  FiFileText,
  FiDownload,
  FiX,
  FiRefreshCw,
} from 'react-icons/fi';
import { Button, Card, Badge, Modal, Input, Loading } from '../../components/ui';
import { format, isBefore, startOfDay } from 'date-fns';

interface Installment {
  id: string;
  saleId: string;
  installmentNumber: number;
  dueDate: string;
  originalAmount: string | number;
  paidAmount: string | number | null;
  paymentDate: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
}

interface CustomerCrediario {
  id: string;
  name: string;
  phone: string;
  installmentCount: number;
  totalPending: number;
  overdueCount: number;
  todayCount: number;
}

interface PaginatedResponse {
  data: CustomerCrediario[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatsResponse {
  overdue: { count: number; total: number };
  pendingToday: { count: number; total: number };
  inDay: { count: number; total: number };
}

export const Installments: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'today' | 'current'>('all');

  // Accordion — qual cliente está expandido
  const [expandedCustomer, setExpandedCustomer] = useState<CustomerCrediario | null>(null);

  // Modal: registrar pagamento
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Modal: editar data individual
  const [isEditDateModalOpen, setIsEditDateModalOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  // Modal: alterar dia de vencimento em lote
  const [isBulkDayModalOpen, setIsBulkDayModalOpen] = useState(false);
  const [bulkNewDay, setBulkNewDay] = useState(15);
  const [bulkOnlyPending, setBulkOnlyPending] = useState(true);

  // Modal: gerar relatório
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportStatus, setReportStatus] = useState<'all' | 'overdue' | 'today' | 'current' | 'paid'>('all');
  const [reportFormat, setReportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportCustomerSearch, setReportCustomerSearch] = useState('');
  const [reportCustomerId, setReportCustomerId] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState('');

  // Modal: renegociação de dívida
  const [isRenModalOpen, setIsRenModalOpen] = useState(false);
  const [renStep, setRenStep] = useState<1 | 2 | 3>(1);
  const [renMode, setRenMode] = useState<'all' | 'pending'>('pending');
  const [renNewTotal, setRenNewTotal] = useState(0);
  const [renHasEntry, setRenHasEntry] = useState(false);
  const [renEntryAmount, setRenEntryAmount] = useState(0);
  const [renEntryDate, setRenEntryDate] = useState('');
  const [renInstallmentsCount, setRenInstallmentsCount] = useState(3);
  const [renFirstDueDate, setRenFirstDueDate] = useState('');
  const [isRenegotiating, setIsRenegotiating] = useState(false);

  const queryClient = useQueryClient();
  const ITEMS_PER_PAGE = 15;

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: response, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['active-crediarios', search, page, statusFilter],
    queryFn: async () => {
      const res = await api.get('/installments/active', {
        params: { search, page, limit: ITEMS_PER_PAGE, filter: statusFilter },
      });
      return res.data as PaginatedResponse;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['installments-stats'],
    queryFn: async () => {
      const res = await api.get('/installments/stats');
      return res.data as StatsResponse;
    },
  });

  const { data: customerInstallments, isLoading: isLoadingInstallments } = useQuery({
    queryKey: ['installments', expandedCustomer?.id],
    queryFn: async () => {
      if (!expandedCustomer) return [];
      const res = await api.get(`/installments/customer/${expandedCustomer.id}`);
      return res.data as Installment[];
    },
    enabled: !!expandedCustomer,
  });

  const { data: customerSuggestions } = useQuery({
    queryKey: ['report-customer-search', reportCustomerSearch],
    queryFn: async () => {
      if (reportCustomerSearch.length < 2) return [];
      const res = await api.get('/installments/active', {
        params: { search: reportCustomerSearch, limit: 6, page: 1 },
      });
      return (res.data.data || []) as CustomerCrediario[];
    },
    enabled: reportCustomerSearch.length >= 2,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const payMutation = useMutation({
    mutationFn: (data: { id: string; paidAmount: number; paymentDate: string }) =>
      api.post(`/installments/${data.id}/pay`, {
        paidAmount: data.paidAmount,
        paymentDate: data.paymentDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao registrar pagamento');
    },
  });

  const editDateMutation = useMutation({
    mutationFn: (data: { id: string; dueDate: string }) =>
      api.patch(`/installments/${data.id}/due-date`, { dueDate: data.dueDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
      setIsEditDateModalOpen(false);
      setSelectedInstallment(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao atualizar data de vencimento');
    },
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/installments/${id}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
    },
  });

  const bulkUpdateDayMutation = useMutation({
    mutationFn: (data: { customerId: string; newDay: number; onlyPending: boolean }) =>
      api.patch('/installments/bulk-update-day', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
      setIsBulkDayModalOpen(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao alterar dia de vencimento');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleExpand = (customer: CustomerCrediario) => {
    setExpandedCustomer(prev => (prev?.id === customer.id ? null : customer));
  };

  const handleOpenPayment = (inst: Installment) => {
    setSelectedInstallment(inst);
    const remaining = Number(inst.originalAmount) - Number(inst.paidAmount || 0);
    setPaidAmount(inst.status === 'partial' ? remaining : Number(inst.originalAmount));
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInstallment) {
      payMutation.mutate({ id: selectedInstallment.id, paidAmount, paymentDate });
    }
  };

  const handleOpenEditDate = (inst: Installment) => {
    setSelectedInstallment(inst);
    setNewDueDate(format(new Date(inst.dueDate), 'yyyy-MM-dd'));
    setIsEditDateModalOpen(true);
  };

  const handleConfirmEditDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInstallment) {
      editDateMutation.mutate({ id: selectedInstallment.id, dueDate: newDueDate });
    }
  };

  const handleConfirmBulkDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (expandedCustomer) {
      bulkUpdateDayMutation.mutate({
        customerId: expandedCustomer.id,
        newDay: bulkNewDay,
        onlyPending: bulkOnlyPending,
      });
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError('');
    setIsGeneratingReport(true);
    try {
      const params: Record<string, string> = { status: reportStatus, format: reportFormat };
      if (reportCustomerId) params.customerId = reportCustomerId;
      if (reportStartDate) params.startDate = reportStartDate;
      if (reportEndDate) params.endDate = reportEndDate;

      const res = await api.get('/reports/credit', {
        params,
        responseType: 'blob',
      });

      const ext = reportFormat === 'pdf' ? 'pdf' : 'xlsx';
      const mime = reportFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-crediario-${dateStr}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setIsReportModalOpen(false);
    } catch (err: any) {
      setReportError('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleReportModalClose = () => {
    setIsReportModalOpen(false);
    setReportError('');
    setReportCustomerSearch('');
    setReportCustomerId('');
    setShowCustomerDropdown(false);
  };

  // ── Renegociação ───────────────────────────────────────────────────────────

  const renPendingInsts = useMemo(
    () => (customerInstallments || []).filter(i => i.status !== 'paid'),
    [customerInstallments]
  );

  const renPendingTotal = useMemo(
    () => renPendingInsts.reduce((sum, i) => sum + Number(i.originalAmount) - Number(i.paidAmount || 0), 0),
    [renPendingInsts]
  );

  const renAllTotal = useMemo(
    () => (customerInstallments || []).reduce((sum, i) => sum + Number(i.originalAmount), 0),
    [customerInstallments]
  );

  const renSourceTotal = renMode === 'pending' ? renPendingTotal : renAllTotal;
  const renDiscount = Math.max(0, renSourceTotal - renNewTotal);

  const renPreviewInstallments = useMemo(() => {
    if (!renFirstDueDate || renInstallmentsCount <= 0 || renNewTotal <= 0) return [];
    const entryAmt = renHasEntry && renEntryAmount > 0 ? renEntryAmount : 0;
    const remaining = renNewTotal - entryAmt;
    const base = Math.floor((remaining / renInstallmentsCount) * 100) / 100;
    const lastAmt = parseFloat((remaining - base * (renInstallmentsCount - 1)).toFixed(2));

    const result: { number: number; amount: number; dueDate: string }[] = [];
    if (entryAmt > 0) {
      result.push({ number: 0, amount: entryAmt, dueDate: renEntryDate || renFirstDueDate });
    }
    const firstDate = new Date(renFirstDueDate + 'T12:00:00');
    for (let i = 0; i < renInstallmentsCount; i++) {
      const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      result.push({
        number: i + 1,
        amount: i === renInstallmentsCount - 1 ? lastAmt : base,
        dueDate: d.toISOString().slice(0, 10),
      });
    }
    return result;
  }, [renNewTotal, renHasEntry, renEntryAmount, renEntryDate, renInstallmentsCount, renFirstDueDate]);

  const handleOpenRenegotiate = () => {
    setRenStep(1);
    setRenMode('pending');
    setRenNewTotal(0);
    setRenHasEntry(false);
    setRenEntryAmount(0);
    setRenEntryDate('');
    setRenInstallmentsCount(3);
    setRenFirstDueDate('');
    setIsRenModalOpen(true);
  };

  const handleRenStep1Next = () => {
    setRenNewTotal(parseFloat(renSourceTotal.toFixed(2)));
    setRenStep(2);
  };

  const handleConfirmRenegotiation = async () => {
    if (!expandedCustomer) return;
    setIsRenegotiating(true);
    try {
      await api.post('/renegotiations', {
        customerId: expandedCustomer.id,
        installmentIds: renPendingInsts.map(i => i.id),
        newTotalAmount: renNewTotal,
        installmentsCount: renInstallmentsCount,
        installments: renPreviewInstallments,
      });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
      setIsRenModalOpen(false);
      alert('Renegociação realizada com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao renegociar. Tente novamente.');
    } finally {
      setIsRenegotiating(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const customerStatusVariant = (c: CustomerCrediario) => {
    if (c.overdueCount > 0) return 'error';
    if (c.todayCount > 0) return 'warning';
    return 'success';
  };

  const customerStatusLabel = (c: CustomerCrediario) => {
    if (c.overdueCount > 0) return 'Em atraso';
    if (c.todayCount > 0) return 'Vence hoje';
    return 'Em dia';
  };

  // Filtro aplicado no backend via ?filter=; lista já chega filtrada e paginada corretamente
  const filteredCustomers = response?.data ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoadingCustomers && !response) return <Loading />;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">

        {/* Título */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Crediário</h1>
          <Button
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-2"
          >
            <FiFileText size={16} />
            Gerar Relatório
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Em Atraso</p>
                <p className="text-2xl font-bold text-red-600">{stats?.overdue?.count || 0}</p>
              </div>
              <FiAlertTriangle className="text-red-500" size={32} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              R$ {(stats?.overdue?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </Card>

          <Card className="p-4 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Vencendo Hoje</p>
                <p className="text-2xl font-bold text-yellow-600">{stats?.pendingToday?.count || 0}</p>
              </div>
              <FiClock className="text-yellow-500" size={32} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              R$ {(stats?.pendingToday?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </Card>

          <Card className="p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Em Dia</p>
                <p className="text-2xl font-bold text-green-600">{stats?.inDay?.count || 0}</p>
              </div>
              <FiCheckCircle className="text-green-500" size={32} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              R$ {(stats?.inDay?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </Card>
        </div>

        {/* Filtro de status */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => { setStatusFilter('all'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Todos
          </button>
          <button
            onClick={() => { setStatusFilter('overdue'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === 'overdue' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <FiAlertTriangle size={12} />
            Em Atraso
          </button>
          <button
            onClick={() => { setStatusFilter('today'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === 'today' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <FiClock size={12} />
            Vencendo Hoje
          </button>
          <button
            onClick={() => { setStatusFilter('current'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === 'current' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <FiCheckCircle size={12} />
            Em Dia
          </button>
        </div>

        {/* Barra de busca + paginação */}
        <div className="flex justify-between items-center mb-4">
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (e.target.value === '') { setSearch(''); setPage(1); }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
            }}
            className="max-w-xs"
            icon={<FiSearch />}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page === 1}
            >
              <FiChevronLeft />
            </Button>
            <span className="text-gray-700 text-sm">
              Página {page} de {response?.totalPages || 1}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage(p => p + 1)}
              disabled={page === (response?.totalPages || 1)}
            >
              <FiChevronRight />
            </Button>
          </div>
        </div>

        {/* Lista accordion */}
        {isLoadingCustomers ? (
          <Loading />
        ) : filteredCustomers.length > 0 ? (
          <div className="space-y-2">
            {filteredCustomers.map((customer) => {
              const isExpanded = expandedCustomer?.id === customer.id;

              return (
                <Card key={customer.id} className="overflow-hidden">
                  {/* Linha do cliente */}
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition select-none"
                    onClick={() => toggleExpand(customer)}
                  >
                    {/* Nome + telefone */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{customer.name}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <FiMessageCircle size={12} />
                        {customer.phone}
                      </p>
                    </div>

                    {/* Parcelas */}
                    <div className="hidden sm:block text-center w-24">
                      <p className="text-lg font-bold text-gray-900">{customer.installmentCount}</p>
                      <p className="text-xs text-gray-500">parcelas</p>
                    </div>

                    {/* Valor pendente */}
                    <div className="hidden md:block text-center w-36">
                      <p className="text-sm font-semibold text-gray-900">
                        R$ {customer.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500">pendente</p>
                    </div>

                    {/* Status */}
                    <div className="w-28 text-center">
                      <Badge variant={customerStatusVariant(customer)}>
                        {customerStatusLabel(customer)}
                      </Badge>
                    </div>

                    {/* Chevron */}
                    <div className="text-gray-400 ml-2">
                      {isExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Parcelas expandidas */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4">
                      {/* Botões de ação em lote */}
                      <div className="flex justify-end gap-2 mb-3">
                        <Button
                          variant="secondary"
                          onClick={(e) => { e.stopPropagation(); handleOpenRenegotiate(); }}
                          className="flex items-center gap-2 text-sm !text-orange-700 !border-orange-300 hover:!bg-orange-50"
                        >
                          <FiRefreshCw size={14} />
                          Renegociar Dívida
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={(e) => { e.stopPropagation(); setIsBulkDayModalOpen(true); }}
                          className="flex items-center gap-2 text-sm"
                        >
                          <FiCalendar size={14} />
                          Alterar Dia de Vencimento
                        </Button>
                      </div>

                      {isLoadingInstallments ? (
                        <Loading />
                      ) : customerInstallments && customerInstallments.length > 0 ? (
                        <div className="space-y-3">
                          {customerInstallments.map((inst) => {
                            const isOverdue =
                              inst.status === 'overdue' ||
                              (inst.status === 'pending' &&
                                isBefore(new Date(inst.dueDate), startOfDay(new Date())));
                            const isToday =
                              format(new Date(inst.dueDate), 'yyyy-MM-dd') ===
                                format(new Date(), 'yyyy-MM-dd') && inst.status === 'pending';

                            return (
                              <Card key={inst.id} className="p-4 bg-white hover:shadow-sm transition">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="font-semibold text-gray-900">
                                        Parcela {inst.installmentNumber}
                                      </span>
                                      <Badge
                                        variant={
                                          inst.status === 'paid'
                                            ? 'success'
                                            : inst.status === 'partial'
                                            ? 'warning'
                                            : isOverdue
                                            ? 'error'
                                            : isToday
                                            ? 'warning'
                                            : 'default'
                                        }
                                      >
                                        {inst.status === 'paid'
                                          ? 'Paga'
                                          : inst.status === 'partial'
                                          ? `Parcial - Pago R$ ${Number(inst.paidAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${Number(inst.originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                          : isOverdue
                                          ? 'Atrasada'
                                          : isToday
                                          ? 'Vence hoje'
                                          : 'Pendente'}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      <div>
                                        <p className="text-gray-600">Vencimento</p>
                                        <p className="font-medium text-gray-900">
                                          {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-gray-600">Valor</p>
                                        <p className="font-medium text-gray-900">
                                          R$ {Number(inst.originalAmount).toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <Button
                                      onClick={() => handleOpenEditDate(inst)}
                                      variant="secondary"
                                      className="flex items-center gap-1 text-sm"
                                    >
                                      <FiEdit size={14} />
                                      Editar Data
                                    </Button>
                                    {inst.status !== 'paid' && (
                                      <Button
                                        onClick={() => handleOpenPayment(inst)}
                                        className="flex items-center gap-1 text-sm"
                                      >
                                        <FiDollarSign size={14} />
                                        Pagar
                                      </Button>
                                    )}
                                    {inst.status === 'paid' && (
                                      <Button
                                        onClick={() => revertMutation.mutate(inst.id)}
                                        variant="secondary"
                                        className="flex items-center gap-1 text-sm"
                                      >
                                        <FiRotateCcw size={14} />
                                        Reverter
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-center text-gray-500 py-4">Nenhuma parcela encontrada</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="text-center py-8 text-gray-500">
            {statusFilter !== 'all' ? 'Nenhum cliente encontrado para o filtro selecionado.' : 'Nenhum crediário ativo encontrado.'}
          </Card>
        )}
      </div>

      {/* Modal: Registrar Pagamento */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar Pagamento"
      >
        <form onSubmit={handleConfirmPayment} className="space-y-4">
          {selectedInstallment && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p className="text-gray-700">
                <span className="font-medium">Valor da parcela:</span>{' '}
                R$ {Number(selectedInstallment.originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {selectedInstallment.status === 'partial' && (
                <p className="text-orange-600">
                  <span className="font-medium">Já pago:</span>{' '}
                  R$ {Number(selectedInstallment.paidAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                  <span className="mx-1">|</span>
                  <span className="font-medium">Restante:</span>{' '}
                  R$ {(Number(selectedInstallment.originalAmount) - Number(selectedInstallment.paidAmount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Valor recebido</label>
            <Input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              step="0.01"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data do pagamento</label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={payMutation.isPending}>
              Confirmar Pagamento
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Editar Data Individual */}
      <Modal
        isOpen={isEditDateModalOpen}
        onClose={() => setIsEditDateModalOpen(false)}
        title="Editar Data de Vencimento"
      >
        <form onSubmit={handleConfirmEditDate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nova Data de Vencimento</label>
            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditDateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={editDateMutation.isPending}>
              Salvar Data
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Alterar Dia de Vencimento em Lote */}
      <Modal
        isOpen={isBulkDayModalOpen}
        onClose={() => setIsBulkDayModalOpen(false)}
        title="Alterar Dia de Vencimento"
      >
        <form onSubmit={handleConfirmBulkDay} className="space-y-4">
          <p className="text-sm text-gray-600">
            Todas as parcelas de <strong>{expandedCustomer?.name}</strong> terão o dia de vencimento
            alterado, mantendo o mês e ano de cada uma.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Novo dia do mês <span className="text-gray-400">(1 – 31)</span>
            </label>
            <Input
              type="number"
              value={bulkNewDay}
              onChange={(e) => setBulkNewDay(Number(e.target.value))}
              min={1}
              max={31}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="onlyPending"
              type="checkbox"
              checked={bulkOnlyPending}
              onChange={(e) => setBulkOnlyPending(e.target.checked)}
              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
            />
            <label htmlFor="onlyPending" className="text-sm text-gray-700 cursor-pointer">
              Aplicar apenas às parcelas pendentes
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsBulkDayModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={bulkUpdateDayMutation.isPending}>
              Confirmar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Gerar Relatório */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={handleReportModalClose}
        title="Gerar Relatório de Crediário"
      >
        <form onSubmit={handleGenerateReport} className="space-y-5">

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status das parcelas</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'all',     label: 'Todos' },
                { value: 'overdue', label: 'Em Atraso' },
                { value: 'today',   label: 'Vencendo Hoje' },
                { value: 'current', label: 'Em Dia' },
                { value: 'paid',    label: 'Quitado' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReportStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    reportStatus === opt.value
                      ? 'bg-rose-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cliente */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cliente específico <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Buscar cliente..."
                value={reportCustomerSearch}
                onChange={(e) => {
                  setReportCustomerSearch(e.target.value);
                  setReportCustomerId('');
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                icon={<FiSearch />}
              />
              {reportCustomerId && (
                <button
                  type="button"
                  onClick={() => { setReportCustomerSearch(''); setReportCustomerId(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <FiX size={14} />
                </button>
              )}
            </div>
            {showCustomerDropdown && reportCustomerSearch.length >= 2 && !reportCustomerId && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {(customerSuggestions ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Nenhum cliente encontrado</div>
                ) : (
                  (customerSuggestions ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex flex-col"
                      onClick={() => {
                        setReportCustomerSearch(c.name);
                        setReportCustomerId(c.id);
                        setShowCustomerDropdown(false);
                      }}
                    >
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.phone}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Período de venda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de venda inicial <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <Input
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de venda final <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <Input
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Formato */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Formato de saída</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${reportFormat === 'pdf' ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="reportFormat"
                  value="pdf"
                  checked={reportFormat === 'pdf'}
                  onChange={() => setReportFormat('pdf')}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">PDF</div>
                  <div className="text-xs text-gray-500 mt-0.5">Recomendado para impressão</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${reportFormat === 'excel' ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="reportFormat"
                  value="excel"
                  checked={reportFormat === 'excel'}
                  onChange={() => setReportFormat('excel')}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Excel / XLSX</div>
                  <div className="text-xs text-gray-500 mt-0.5">Recomendado para análise</div>
                </div>
              </label>
            </div>
          </div>

          {reportError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{reportError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={handleReportModalClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isGeneratingReport}
              className="flex items-center gap-2"
            >
              {!isGeneratingReport && <FiDownload size={15} />}
              {isGeneratingReport ? 'Gerando...' : 'Gerar e Baixar'}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Modal: Renegociação de Dívida */}
      <Modal
        isOpen={isRenModalOpen}
        onClose={() => setIsRenModalOpen(false)}
        title={`Renegociar Dívida — ${expandedCustomer?.name ?? ''}`}
        size="lg"
      >
        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 mb-5">
          {([1, 2, 3] as const).map((s) => (
            <React.Fragment key={s}>
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${renStep >= s ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 ${renStep > s ? 'bg-rose-600' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── ETAPA 1: Selecionar parcelas ── */}
        {renStep === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Selecionar o que renegociar</h3>

            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${renMode === 'pending' ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="renMode" value="pending" checked={renMode === 'pending'} onChange={() => setRenMode('pending')} className="mt-0.5 accent-rose-600" />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Somar apenas o que falta</div>
                  <div className="text-xs text-gray-500 mt-0.5">Apenas parcelas pendentes e atrasadas</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${renMode === 'all' ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="renMode" value="all" checked={renMode === 'all'} onChange={() => setRenMode('all')} className="mt-0.5 accent-rose-600" />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Somar tudo</div>
                  <div className="text-xs text-gray-500 mt-0.5">Inclui valor total de todas as parcelas</div>
                </div>
              </label>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-orange-800 font-medium">Total a renegociar:</span>
                <span className="text-orange-900 font-bold text-base">
                  R$ {renSourceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-orange-700 text-xs mt-1">
                {renPendingInsts.length} parcela(s) pendente(s)/atrasada(s) serão canceladas e substituídas pelo novo acordo.
              </p>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {(customerInstallments || []).map(inst => {
                const isPending = inst.status !== 'paid';
                return (
                  <div key={inst.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${isPending ? 'bg-white border-orange-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isPending ? 'bg-orange-400' : 'bg-green-400'}`} />
                      <span className="font-medium text-gray-800">
                        {inst.installmentNumber === 0 ? 'Entrada' : `Parcela ${inst.installmentNumber}`}
                      </span>
                      <span className="text-gray-500">{format(new Date(inst.dueDate), 'dd/MM/yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">R$ {Number(inst.originalAmount).toFixed(2)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${isPending ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {isPending ? 'será cancelada' : 'paga ✓'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleRenStep1Next}
                disabled={renPendingInsts.length === 0}
                className="flex items-center gap-2"
              >
                Próximo →
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 2: Configurar novo acordo ── */}
        {renStep === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Configurar novo parcelamento</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor total da renegociação</label>
              <Input
                type="number"
                value={renNewTotal}
                onChange={e => setRenNewTotal(Number(e.target.value))}
                step="0.01"
                min={0.01}
              />
              {renDiscount > 0 && (
                <p className="text-green-700 text-xs mt-1 font-medium">
                  Desconto aplicado: R$ {renDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input id="renHasEntry" type="checkbox" checked={renHasEntry} onChange={e => setRenHasEntry(e.target.checked)} className="w-4 h-4 accent-rose-600" />
              <label htmlFor="renHasEntry" className="text-sm text-gray-700 cursor-pointer">Incluir entrada</label>
            </div>

            {renHasEntry && (
              <div className="grid grid-cols-2 gap-3 pl-7">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor da entrada</label>
                  <Input type="number" value={renEntryAmount} onChange={e => setRenEntryAmount(Number(e.target.value))} step="0.01" min={0.01} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da entrada</label>
                  <Input type="date" value={renEntryDate} onChange={e => setRenEntryDate(e.target.value)} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de parcelas</label>
                <Input type="number" value={renInstallmentsCount} onChange={e => setRenInstallmentsCount(Number(e.target.value))} min={1} max={60} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data da 1ª parcela</label>
                <Input type="date" value={renFirstDueDate} onChange={e => setRenFirstDueDate(e.target.value)} />
              </div>
            </div>

            {renPreviewInstallments.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Prévia das parcelas</p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {renPreviewInstallments.map(inst => (
                    <div key={inst.number} className="flex justify-between items-center px-3 py-2 text-sm">
                      <span className="text-gray-600">{inst.number === 0 ? 'Entrada' : `Parcela ${inst.number}`}</span>
                      <span className="text-gray-500">{format(new Date(inst.dueDate + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                      <span className="font-semibold text-gray-800">R$ {inst.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setRenStep(1)}>← Voltar</Button>
              <Button
                onClick={() => setRenStep(3)}
                disabled={!renFirstDueDate || renInstallmentsCount < 1 || renNewTotal <= 0 || renPreviewInstallments.length === 0}
              >
                Próximo →
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 3: Confirmação ── */}
        {renStep === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Confirmar renegociação</h3>

            <div className="space-y-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <p className="font-semibold text-red-800 mb-1">Parcelas que serão CANCELADAS:</p>
                <p className="text-red-700">{renPendingInsts.length} parcela(s) — R$ {renSourceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="font-semibold text-green-800 mb-1">Novo acordo criado:</p>
                <p className="text-green-700">
                  {renHasEntry && renEntryAmount > 0
                    ? `Entrada de R$ ${renEntryAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} + `
                    : ''}
                  {renInstallmentsCount}x de R$ {renPreviewInstallments.filter(i => i.number > 0)[0]?.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-green-700">Total: R$ {renNewTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>

              {renDiscount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 font-semibold">
                    Desconto concedido: R$ {renDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ Esta ação é irreversível. As parcelas canceladas não poderão ser restauradas.
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setRenStep(2)}>← Voltar</Button>
              <Button
                onClick={handleConfirmRenegotiation}
                loading={isRenegotiating}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Confirmar Renegociação
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
