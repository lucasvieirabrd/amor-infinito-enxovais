import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FiSearch,
  FiAlertTriangle,
  FiDollarSign,
  FiArrowLeft,
  FiRotateCcw,
  FiMessageCircle,
  FiChevronLeft,
  FiChevronRight,
  FiEdit,
  FiClock,
  FiCheckCircle,
} from 'react-icons/fi';
import { Button, Card, Badge, Modal, Input, Loading } from '../../components/ui';
import { format, isBefore, startOfDay } from 'date-fns';

interface Installment {
  id: string;
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
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCrediario | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isEditDateModalOpen, setIsEditDateModalOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  const queryClient = useQueryClient();

  const ITEMS_PER_PAGE = 15;

  const { data: response, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['active-crediarios', search, page],
    queryFn: async () => {
      const res = await api.get('/installments/active', {
        params: { search, page, limit: ITEMS_PER_PAGE },
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
    queryKey: ['installments', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      const res = await api.get(`/installments/customer/${selectedCustomer.id}`);
      return res.data as Installment[];
    },
    enabled: !!selectedCustomer,
  });

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
      api.patch(`/installments/${data.id}/due-date`, {
        dueDate: data.dueDate,
      }),
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

  const handleOpenPayment = (inst: Installment) => {
    setSelectedInstallment(inst);
    setPaidAmount(Number(inst.originalAmount));
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInstallment) {
      payMutation.mutate({
        id: selectedInstallment.id,
        paidAmount,
        paymentDate,
      });
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
      editDateMutation.mutate({
        id: selectedInstallment.id,
        dueDate: newDueDate,
      });
    }
  };

  const handleBackToList = () => {
    setSelectedCustomer(null);
  };

  if (isLoadingCustomers && !response) {
    return <Loading />;
  }

  if (selectedCustomer) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition"
          >
            <FiArrowLeft size={20} />
            Voltar para lista
          </button>

          <Card className="mb-6 p-6 bg-gradient-to-r from-primary/10 to-secondary/10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{selectedCustomer.name}</h1>
                <p className="text-gray-600 flex items-center gap-2 mt-1">
                  <FiMessageCircle size={16} />
                  {selectedCustomer.phone}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Total de parcelas</p>
                <p className="text-3xl font-bold text-primary">
                  {customerInstallments?.length || 0}
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {isLoadingInstallments ? (
              <Loading />
            ) : customerInstallments && customerInstallments.length > 0 ? (
              (customerInstallments || []).map((inst) => {
                const isOverdue =
                  isBefore(new Date(inst.dueDate), startOfDay(new Date())) && inst.status === 'pending';
                const isToday =
                  format(new Date(inst.dueDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') &&
                  inst.status === 'pending';

                return (
                  <Card key={inst.id} className="p-4 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
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
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleOpenEditDate(inst)}
                          variant="secondary"
                          className="flex items-center gap-2"
                        >
                          <FiEdit size={16} />
                          Editar Data
                        </Button>
                        {inst.status === 'pending' && (
                          <Button
                            onClick={() => handleOpenPayment(inst)}
                            className="ml-4 flex items-center gap-2"
                          >
                            <FiDollarSign size={16} />
                            Pagar
                          </Button>
                        )}
                        {inst.status === 'paid' && (
                          <Button
                            onClick={() => revertMutation.mutate(inst.id)}
                            variant="secondary"
                            className="flex items-center gap-2"
                          >
                            <FiRotateCcw size={16} />
                            Reverter
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : (
              <Card className="text-center py-8 text-gray-500">Nenhuma parcela encontrada</Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Crediário</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>

        <div className="flex justify-between items-center mb-6">
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            icon={<FiSearch />}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1}
            >
              <FiChevronLeft />
            </Button>
            <span className="text-gray-700">
              Página {page} de {response?.totalPages || 1}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={page === (response?.totalPages || 1)}
            >
              <FiChevronRight />
            </Button>
          </div>
        </div>

        {isLoadingCustomers ? (
          <Loading />
        ) : response?.data && response.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {response.data.map((customer) => (
              <Card
                key={customer.id}
                className="p-4 hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedCustomer(customer)}
              >
                <h3 className="text-lg font-semibold text-gray-900">{customer.name}</h3>
                <p className="text-gray-600 flex items-center gap-2 mt-1">
                  <FiMessageCircle size={16} />
                  {customer.phone}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-8 text-gray-500">Nenhum crediário ativo encontrado.</Card>
        )}

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
      </div>
    </div>
  );
};
