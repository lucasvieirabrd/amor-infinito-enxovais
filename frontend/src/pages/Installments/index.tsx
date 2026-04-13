import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
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
  status: 'pending' | 'paid' | 'overdue';
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
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);

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

  const queryClient = useQueryClient();
  const ITEMS_PER_PAGE = 15;

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: response, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['active-crediarios', debouncedSearch, page],
    queryFn: async () => {
      const res = await api.get('/installments/active', {
        params: { search: debouncedSearch, page, limit: ITEMS_PER_PAGE },
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
    setPaidAmount(Number(inst.originalAmount));
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoadingCustomers && !response) return <Loading />;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">

        {/* Título */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Crediário</h1>

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

        {/* Barra de busca + paginação */}
        <div className="flex justify-between items-center mb-4">
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
        ) : response?.data && response.data.length > 0 ? (
          <div className="space-y-2">
            {response.data.map((customer) => {
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
                      {/* Botão alterar dia em lote */}
                      <div className="flex justify-end mb-3">
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
                                            : isOverdue
                                            ? 'error'
                                            : isToday
                                            ? 'warning'
                                            : 'default'
                                        }
                                      >
                                        {inst.status === 'paid'
                                          ? 'Paga'
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
          <Card className="text-center py-8 text-gray-500">Nenhum crediário ativo encontrado.</Card>
        )}
      </div>

      {/* Modal: Registrar Pagamento */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar Pagamento"
      >
        <form onSubmit={handleConfirmPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Valor Pago</label>
            <Input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              step="0.01"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data do Pagamento</label>
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
              Novo dia do mês <span className="text-gray-400">(1 – 28)</span>
            </label>
            <Input
              type="number"
              value={bulkNewDay}
              onChange={(e) => setBulkNewDay(Number(e.target.value))}
              min={1}
              max={28}
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
    </div>
  );
};
