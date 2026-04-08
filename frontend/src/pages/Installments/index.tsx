import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  FiSearch,
  FiAlertTriangle,
  FiDollarSign,
  FiCalendar,
  FiArrowLeft,
  FiX,
  FiRotateCcw,
  FiMessageCircle,
  FiChevronLeft,
  FiChevronRight,
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

  const queryClient = useQueryClient();

  const ITEMS_PER_PAGE = 15;

  // Listar clientes com crediários ativos com paginação
  const { data: response, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['active-crediarios', search, page],
    queryFn: async () => {
      const res = await api.get('/installments/active', {
        params: { search, page, limit: ITEMS_PER_PAGE },
      });
      return res.data as PaginatedResponse;
    },
  });

  // Buscar estatísticas
  const { data: stats } = useQuery({
    queryKey: ['installments-stats'],
    queryFn: async () => {
      const res = await api.get('/installments/stats');
      return res.data as StatsResponse;
    },
  });

  // Buscar parcelas do cliente selecionado
  const { data: customerInstallments, isLoading: isLoadingInstallments } = useQuery({
    queryKey: ['installments', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      const res = await api.get(`/installments/customer/${selectedCustomer.id}`);
      return res.data as Installment[];
    },
    enabled: !!selectedCustomer,
  });

  // Mutação para dar baixa em parcela
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

  // Mutação para reverter pagamento
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

  const handleBackToList = () => {
    setSelectedCustomer(null);
  };

  if (isLoadingCustomers && !response) {
    return <Loading />;
  }

  const startIndex = (page - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE - 1, response?.total || 0);

  // Se um cliente foi selecionado, mostrar suas parcelas
  if (selectedCustomer) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          {/* Botão voltar */}
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition"
          >
            <FiArrowLeft size={20} />
            Voltar para lista
          </button>

          {/* Header do cliente */}
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

          {/* Parcelas */}
          <div className="space-y-3">
            {isLoadingInstallments ? (
              <Loading />
            ) : customerInstallments && customerInstallments.length > 0 ? (
              (customerInstallments || []).map((inst) => {
                const isOverdue = isBefore(new Date(inst.dueDate), startOfDay(new Date())) && inst.status === 'pending';
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
                              ? 'Em atraso'
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
                          className="ml-4 flex items-center gap-2"
                        >
                          <FiRotateCcw size={16} />
                          Reverter
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            ) : (
              <Card className="text-center py-8 text-gray-500">
                Nenhuma parcela encontrada
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Lista de clientes com crediário
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header com título e contadores */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Crediário</h1>

          {/* Badges de contadores */}
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
                R$ {(stats?.overdue?.total || 0).toFixed(2)}
              </p>
            </Card>

            <Card className="p-4 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Vencendo Hoje</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats?.pendingToday?.count || 0}</p>
                </div>
                <FiCalendar className="text-yellow-500" size={32} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                R$ {(stats?.pendingToday?.total || 0).toFixed(2)}
              </p>
            </Card>

            <Card className="p-4 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Em Dia</p>
                  <p className="text-2xl font-bold text-green-600">{stats?.inDay?.count || 0}</p>
                </div>
                <FiDollarSign className="text-green-500" size={32} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Clientes com crediário ativo</p>
            </Card>
          </div>
        </div>

        {/* Barra de busca */}
        <Card className="mb-6 p-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>
        </Card>

        {/* Lista de clientes */}
        <Card className="mb-6">
          {isLoadingCustomers ? (
            <Loading />
          ) : response?.data && response.data.length > 0 ? (
            <div className="divide-y">
              {(response?.data || []).map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-semibold text-primary">{customer.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{customer.name}</p>
                      <p className="text-sm text-gray-600">{customer.phone}</p>
                    </div>
                  </div>
                  <FiChevronRight className="text-gray-400" size={20} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Nenhum cliente com crediário ativo encontrado
            </div>
          )}
        </Card>

        {/* Paginação */}
        {response && response.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Mostrando {startIndex} a {endIndex} de {response.total} clientes
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

      {/* Modal de Pagamento */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedInstallment(null);
        }}
        title="Registrar Pagamento"
      >
        <form onSubmit={handleConfirmPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parcela {selectedInstallment?.installmentNumber}
            </label>
            <p className="text-gray-600">
              Vencimento: {selectedInstallment && format(new Date(selectedInstallment.dueDate), 'dd/MM/yyyy')}
            </p>
          </div>

          <Input
            label="Valor Pago (R$)"
            type="number"
            step="0.01"
            value={paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
            required
          />

          <Input
            label="Data do Pagamento"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" loading={payMutation.isPending} className="flex-1">
              Confirmar Pagamento
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsPaymentModalOpen(false);
                setSelectedInstallment(null);
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
