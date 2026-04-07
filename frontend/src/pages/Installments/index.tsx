import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  FiSearch, FiAlertTriangle, 
  FiDollarSign, FiCalendar, FiArrowLeft, FiX, FiRotateCcw 
} from 'react-icons/fi';
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
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-600 uppercase">Pago</span>;
    }
    
    if (isBefore(date, today)) {
      return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600 uppercase">Atrasado</span>;
    }
    
    return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600 uppercase">Pendente</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Crediário</h2>
          <p className="text-gray-600">Gestão de parcelas e cobranças</p>
        </div>
        {selectedCustomer && (
          <button 
            onClick={() => setSelectedCustomer(null)}
            className="flex items-center text-primary-600 font-bold hover:underline"
          >
            <FiArrowLeft className="mr-2" /> Voltar para Lista
          </button>
        )}
      </div>

      {!selectedCustomer ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Lista de Clientes Ativos */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Clientes com Crediário Ativo</h3>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Filtrar por nome ou telefone..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {isLoadingCustomers ? (
                  <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : activeCustomers?.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">Nenhum crediário ativo no momento.</div>
                ) : activeCustomers?.map(customer => (
                  <button 
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold mr-4">
                        {customer.name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-800">{customer.name}</p>
                        <p className="text-xs text-gray-500">{customer.phone}</p>
                      </div>
                    </div>
                    <FiArrowLeft className="transform rotate-180 text-gray-300" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Resumo de Inadimplência */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Resumo de Atrasos</h3>
            <div className="bg-red-50 p-6 rounded-xl border border-red-100 space-y-4">
              <div className="flex items-center text-red-600">
                <FiAlertTriangle size={24} className="mr-3" />
                <span className="font-bold">Total em Atraso</span>
              </div>
              <div>
                <p className="text-3xl font-black text-red-700">
                  R$ {overdueSummary?.reduce((acc: number, curr: any) => acc + curr.totalOverdue, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </p>
                <p className="text-sm text-red-600 mt-1">
                  {overdueSummary?.length || 0} clientes inadimplentes
                </p>
              </div>
              <button className="w-full py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors text-sm">
                Gerar Relatório de Cobrança
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {/* Cabeçalho do Cliente Selecionado */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center">
              <div className="h-14 w-14 rounded-full bg-primary-600 text-white flex items-center justify-center text-2xl font-bold mr-4">
                {selectedCustomer.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">{selectedCustomer.name}</h3>
                <p className="text-gray-500">{selectedCustomer.phone}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors text-sm">
                WhatsApp
              </button>
            </div>
          </div>

          {/* Tabela de Parcelas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº Parcela</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor Original</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pagamento</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingInstallments ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center">Carregando parcelas...</td></tr>
                ) : customerInstallments?.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">{inst.installmentNumber}ª Parcela</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(inst.dueDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                      R$ {parseFloat(inst.originalAmount.toString()).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(inst.status, inst.dueDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {inst.paymentDate ? (
                        <div>
                          <p className="font-bold text-green-600">R$ {parseFloat(inst.paidAmount?.toString() || '0').toFixed(2)}</p>
                          <p className="text-[10px]">{format(new Date(inst.paymentDate), 'dd/MM/yyyy')}</p>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {inst.status !== 'paid' ? (
                        <button 
                          onClick={() => handleOpenPayment(inst)}
                          className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                        >
                          Dar Baixa
                        </button>
                      ) : (
                        <button 
                          onClick={() => revertMutation.mutate(inst.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
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
        </div>
      )}

      {/* Modal de Pagamento */}
      {isPaymentModalOpen && selectedInstallment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">Baixa de Parcela</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={24} />
              </button>
            </div>
            
            <form onSubmit={handleConfirmPayment} className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold">Resumo da Parcela</p>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Vencimento:</span>
                  <span className="text-sm font-bold text-gray-800">{format(new Date(selectedInstallment.dueDate), 'dd/MM/yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Valor Original:</span>
                  <span className="text-sm font-bold text-gray-800">R$ {parseFloat(selectedInstallment.originalAmount.toString()).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Pago (R$)</label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiDollarSign className="text-gray-400" />
                  </div>
                  <input 
                    type="number" step="0.01" required
                    className="block w-full pl-10 border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    value={paidAmount}
                    onChange={e => setPaidAmount(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data do Recebimento</label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiCalendar className="text-gray-400" />
                  </div>
                  <input 
                    type="date" required
                    className="block w-full pl-10 border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={payMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {payMutation.isPending ? 'Confirmando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
