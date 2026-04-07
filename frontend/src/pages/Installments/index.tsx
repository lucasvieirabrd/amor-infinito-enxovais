import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  FiSearch, FiAlertTriangle, FiDollarSign, FiCalendar, FiArrowLeft, FiX, FiRotateCcw, FiMessageCircle
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

export const Installments: React.FC = () => {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCrediario | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const queryClient = useQueryClient();

  // Listar clientes com crediários ativos
  const { data: activeCustomers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['active-crediarios'],
    queryFn: async () => {
      const response = await api.get('/installments/active');
      return response.data as CustomerCrediario[];
    },
  });

  // Listar inadimplentes para o resumo
  const { data: overdueSummary } = useQuery({
    queryKey: ['overdue-summary'],
    queryFn: async () => {
      const response = await api.get('/installments/overdue');
      return response.data;
    },
  });

  // Buscar parcelas do cliente selecionado
  const { data: customerInstallments, isLoading: isLoadingInstallments } = useQuery({
    queryKey: ['installments', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      const response = await api.get(`/installments/customer/${selectedCustomer.id}`);
      return response.data as Installment[];
    },
    enabled: !!selectedCustomer,
  });

  // Mutação para dar baixa em parcela
  const payMutation = useMutation({
    mutationFn: (data: { id: string, paidAmount: number, paymentDate: string }) => 
      api.post(`/installments/${data.id}/pay`, { paidAmount: data.paidAmount, paymentDate: data.paymentDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-summary'] });
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao registrar pagamento');
    }
  });

  // Mutação para reverter pagamento
  const revertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/installments/${id}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['active-crediarios'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-summary'] });
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

  const getStatusBadge = (status: string, dueDate: string) => {
    const today = startOfDay(new Date());
    const date = startOfDay(new Date(dueDate));
    
    if (status === 'paid') {
      return <Badge variant="success">Pago</Badge>;
    }
    
    if (isBefore(date, today)) {
      return <Badge variant="error">Atrasado</Badge>;
    }
    
    return <Badge variant="info">Pendente</Badge>;
  };

  const totalOverdue = overdueSummary?.reduce((acc: number, curr: any) => acc + curr.totalOverdue, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Crediário</h1>
          <p className="text-gray-600 mt-1">Gestão de parcelas e cobranças</p>
        </div>
        {selectedCustomer && (
          <Button
            variant="secondary"
            onClick={() => setSelectedCustomer(null)}
            className="flex items-center gap-2"
          >
            <FiArrowLeft size={20} />
            Voltar para Lista
          </Button>
        )}
      </div>

      {!selectedCustomer ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Customers List */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="Clientes com Crediário Ativo" subtitle="Selecione um cliente para gerenciar suas parcelas">
              <div className="space-y-3">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input 
                    type="text"
                    placeholder="Filtrar por nome ou telefone..."
                    className="input-base pl-10 w-full"
                  />
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {isLoadingCustomers ? (
                    <Loading variant="skeleton" />
                  ) : activeCustomers?.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      Nenhum crediário ativo no momento.
                    </div>
                  ) : (
                    activeCustomers?.map(customer => (
                      <button 
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="w-full flex items-center justify-between p-4 bg-background rounded-lg border border-gray-200 hover:border-primary hover:bg-primary hover:bg-opacity-5 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                            {customer.name.charAt(0)}
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-gray-900">{customer.name}</p>
                            <p className="text-xs text-gray-600">{customer.phone}</p>
                          </div>
                        </div>
                        <FiArrowLeft className="transform rotate-180 text-gray-300" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Overdue Summary */}
          <div className="space-y-4">
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-error bg-opacity-10 rounded-lg">
                    <FiAlertTriangle className="text-error" size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Total em Atraso</p>
                    <p className="text-2xl font-bold text-error">
                      R$ {totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-900">{overdueSummary?.length || 0}</span> cliente{overdueSummary?.length !== 1 ? 's' : ''} inadimplente{overdueSummary?.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button variant="secondary" size="lg" className="w-full">
                  Gerar Relatório
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Customer Header */}
          <Card>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                  <p className="text-gray-600">{selectedCustomer.phone}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                className="flex items-center gap-2"
              >
                <FiMessageCircle size={20} />
                Enviar WhatsApp
              </Button>
            </div>
          </Card>

          {/* Installments Table */}
          <Card title="Parcelas" subtitle="Histórico de parcelas deste cliente">
            {isLoadingInstallments ? (
              <Loading variant="skeleton" />
            ) : customerInstallments?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Nenhuma parcela encontrada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Parcela</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vencimento</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor Original</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Pagamento</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {customerInstallments?.map((inst) => (
                      <tr key={inst.id} className="hover:bg-background transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {inst.installmentNumber}ª Parcela
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          R$ {parseFloat(inst.originalAmount.toString()).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {getStatusBadge(inst.status, inst.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {inst.paymentDate ? (
                            <div>
                              <p className="font-semibold text-success">R$ {parseFloat(inst.paidAmount?.toString() || '0').toFixed(2)}</p>
                              <p className="text-xs text-gray-600">{format(new Date(inst.paymentDate), 'dd/MM/yyyy')}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {inst.status !== 'paid' ? (
                            <Button 
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenPayment(inst)}
                            >
                              Dar Baixa
                            </Button>
                          ) : (
                            <button 
                              onClick={() => revertMutation.mutate(inst.id)}
                              className="text-gray-400 hover:text-error transition-colors p-2 rounded-lg hover:bg-error hover:bg-opacity-10"
                              title="Reverter Pagamento"
                            >
                              <FiRotateCcw size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Baixa de Parcela"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={payMutation.isPending}
              onClick={handleConfirmPayment}
            >
              Confirmar Pagamento
            </Button>
          </>
        }
      >
        {selectedInstallment && (
          <form onSubmit={handleConfirmPayment} className="space-y-6">
            {/* Installment Summary */}
            <div className="bg-background p-4 rounded-lg border border-gray-200 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase">Resumo da Parcela</p>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Vencimento:</span>
                <span className="text-sm font-semibold text-gray-900">
                  {format(new Date(selectedInstallment.dueDate), 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Valor Original:</span>
                <span className="text-sm font-semibold text-gray-900">
                  R$ {parseFloat(selectedInstallment.originalAmount.toString()).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Amount */}
            <Input
              label="Valor Pago (R$)"
              type="number"
              step="0.01"
              required
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
            />

            {/* Payment Date */}
            <Input
              label="Data do Recebimento"
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </form>
        )}
      </Modal>
    </div>
  );
};
