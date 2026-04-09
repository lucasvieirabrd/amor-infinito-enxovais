import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FiAlertTriangle,
  FiDollarSign,
  FiRotateCcw,
  FiMessageCircle,
  FiEdit,
  FiClock,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiSearch,
} from 'react-icons/fi';
import { Button, Card, Badge, Modal, Input, Loading } from '../../components/ui';
import { format, isBefore, startOfDay } from 'date-fns';

interface BillingRecord {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  installmentNumber: number;
  dueDate: string;
  originalAmount: number;
  paidAmount: number | null;
  paymentDate: string | null;
  status: 'pending' | 'paid' | 'overdue';
  daysOverdue?: number;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  customerPhone: string;
  installments: BillingRecord[];
  overdueCount: number;
  totalOverdue: number;
}

interface StatsResponse {
  overdue: { count: number; total: number };
  pendingToday: { count: number; total: number };
  inDay: { count: number; total: number };
}

export const Billing: React.FC = () => {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditDateModalOpen, setIsEditDateModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<BillingRecord | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newDueDate, setNewDueDate] = useState('');

  const queryClient = useQueryClient();

  const { data: billingRecords, isLoading } = useQuery({
    queryKey: ['billing-records'],
    queryFn: async () => {
      const res = await api.get('/installments/billing');
      return res.data as BillingRecord[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['installments-stats'],
    queryFn: async () => {
      const res = await api.get('/installments/stats');
      return res.data as StatsResponse;
    },
  });

  const payMutation = useMutation({
    mutationFn: (data: { id: string; paidAmount: number; paymentDate: string }) =>
      api.post(`/installments/${data.id}/pay`, {
        paidAmount: data.paidAmount,
        paymentDate: data.paymentDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-records'] });
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
      queryClient.invalidateQueries({ queryKey: ['billing-records'] });
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
      queryClient.invalidateQueries({ queryKey: ['billing-records'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao reverter pagamento');
    },
  });

  const handleOpenPayment = (inst: BillingRecord) => {
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

  const handleOpenEditDate = (inst: BillingRecord) => {
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

  // Agrupar parcelas por cliente
  const customerGroups: CustomerGroup[] = React.useMemo(() => {
    if (!billingRecords) return [];

    const map = new Map<string, CustomerGroup>();
    billingRecords.forEach((rec) => {
      if (!map.has(rec.customerId)) {
        map.set(rec.customerId, {
          customerId: rec.customerId,
          customerName: rec.customerName,
          customerPhone: rec.customerPhone,
          installments: [],
          overdueCount: 0,
          totalOverdue: 0,
        });
      }
      const group = map.get(rec.customerId)!;
      group.installments.push(rec);
      const isOverdue =
        rec.status === 'overdue' ||
        (rec.status === 'pending' && isBefore(new Date(rec.dueDate), startOfDay(new Date())));
      if (isOverdue) {
        group.overdueCount += 1;
        group.totalOverdue += Number(rec.originalAmount);
      }
    });

    return Array.from(map.values()).filter((g) =>
      g.customerName.toLowerCase().includes(search.toLowerCase()) ||
      g.customerPhone.includes(search)
    );
  }, [billingRecords, search]);

  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Cobrança</h1>

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

        {/* Busca */}
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            icon={<FiSearch />}
          />
        </div>

        {/* Lista de clientes */}
        {customerGroups.length === 0 ? (
          <Card className="text-center py-8 text-gray-500">
            Nenhum cliente com parcelas pendentes encontrado.
          </Card>
        ) : (
          <div className="space-y-4">
            {customerGroups.map((group) => {
              const isExpanded = expandedCustomer === group.customerId;
              return (
                <Card key={group.customerId} className="overflow-hidden">
                  {/* Cabeçalho do cliente */}
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                    onClick={() =>
                      setExpandedCustomer(isExpanded ? null : group.customerId)
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{group.customerName}</h3>
                        <p className="text-gray-600 flex items-center gap-2 mt-1 text-sm">
                          <FiMessageCircle size={14} />
                          {group.customerPhone}
                        </p>
                      </div>
                      {group.overdueCount > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="error">
                            {group.overdueCount} {group.overdueCount === 1 ? 'parcela atrasada' : 'parcelas atrasadas'}
                          </Badge>
                          <span className="text-sm font-medium text-red-600">
                            R$ {group.totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                      <span className="text-sm text-gray-500">{group.installments.length} parcelas</span>
                      {isExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                    </div>
                  </div>

                  {/* Parcelas expandidas */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                      {group.installments.map((inst) => {
                        const isOverdue =
                          inst.status === 'overdue' ||
                          (inst.status === 'pending' &&
                            isBefore(new Date(inst.dueDate), startOfDay(new Date())));
                        const isToday =
                          format(new Date(inst.dueDate), 'yyyy-MM-dd') ===
                            format(new Date(), 'yyyy-MM-dd') && inst.status === 'pending';

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
                                {inst.status !== 'paid' && (
                                  <Button
                                    onClick={() => handleOpenPayment(inst)}
                                    className="flex items-center gap-2"
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
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal Pagamento */}
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

        {/* Modal Editar Data */}
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
