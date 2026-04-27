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
  FiTrendingUp,
  FiSend,
  FiList,
  FiDownload,
} from 'react-icons/fi';
import { Button, Card, Badge, Modal, Input, Loading } from '../../components/ui';
import { format, isBefore, startOfDay } from 'date-fns';

// ── interfaces ───────────────────────────────────────────
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
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  daysOverdue?: number;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  customerPhone: string;
  installments: BillingRecord[];
  overdueCount: number;
  totalOverdue: number;
  todayCount: number;
}

interface StatsResponse {
  overdue: { count: number; total: number };
  pendingToday: { count: number; total: number };
  inDay: { count: number; total: number };
}

interface ChargesPreview {
  todayCount: number;
  overdueCount: number;
  totalCount: number;
}

interface BillingMessage {
  id: string;
  customerName: string;
  phone: string;
  content: string;
  status: string;
  timestamp: string;
}

type Period = 'today' | '7d' | '30d';

// ── componente ───────────────────────────────────────────
export const Billing: React.FC = () => {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditDateModalOpen, setIsEditDateModalOpen] = useState(false);
  const [isSendChargesModalOpen, setIsSendChargesModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<BillingRecord | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newDueDate, setNewDueDate] = useState('');
  const [messagesPeriod, setMessagesPeriod] = useState<Period>('today');
  const [activeTab, setActiveTab] = useState<'parcelas' | 'mensagens'>('parcelas');

  const [exportingPdf, setExportingPdf] = useState(false);
  const queryClient = useQueryClient();

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const response = await api.get('/billing/relatorio/pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-cobranca-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar relatório PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── queries ──────────────────────────────────────────────
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

  const { data: chargesPreview, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['charges-preview'],
    queryFn: async () => {
      const res = await api.get('/billing/charges-preview');
      return res.data as ChargesPreview;
    },
    enabled: isSendChargesModalOpen,
  });

  const { data: billingMessages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ['billing-messages', messagesPeriod],
    queryFn: async () => {
      const res = await api.get('/billing/messages', { params: { period: messagesPeriod } });
      return res.data as BillingMessage[];
    },
    enabled: activeTab === 'mensagens',
  });

  // ── mutations ────────────────────────────────────────────
  const payMutation = useMutation({
    mutationFn: (data: { id: string; paidAmount: number; paymentDate: string }) =>
      api.post(`/installments/${data.id}/pay`, { paidAmount: data.paidAmount, paymentDate: data.paymentDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-records'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Erro ao registrar pagamento'),
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
    onError: (err: any) => alert(err.response?.data?.message || 'Erro ao atualizar data de vencimento'),
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/installments/${id}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-records'] });
      queryClient.invalidateQueries({ queryKey: ['installments-stats'] });
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Erro ao reverter pagamento'),
  });

  const sendChargesMutation = useMutation({
    mutationFn: () => api.post('/billing/send-charges'),
    onSuccess: (res) => {
      const { success, failed } = res.data;
      setIsSendChargesModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['billing-messages'] });
      alert(`✅ Cobranças disparadas!\nEnviadas: ${success}\nFalhas: ${failed}`);
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Erro ao disparar cobranças'),
  });

  // ── handlers ─────────────────────────────────────────────
  const handleOpenPayment = (inst: BillingRecord) => {
    setSelectedInstallment(inst);
    const remaining = Number(inst.originalAmount) - Number(inst.paidAmount || 0);
    setPaidAmount(inst.status === 'partial' ? remaining : Number(inst.originalAmount));
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInstallment) payMutation.mutate({ id: selectedInstallment.id, paidAmount, paymentDate });
  };

  const handleOpenEditDate = (inst: BillingRecord) => {
    setSelectedInstallment(inst);
    setNewDueDate(format(new Date(inst.dueDate), 'yyyy-MM-dd'));
    setIsEditDateModalOpen(true);
  };

  const handleConfirmEditDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInstallment) editDateMutation.mutate({ id: selectedInstallment.id, dueDate: newDueDate });
  };

  // ── agrupamento por cliente ───────────────────────────────
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
          todayCount: 0,
        });
      }
      const group = map.get(rec.customerId)!;
      group.installments.push(rec);
      const isOverdue =
        rec.status === 'overdue' ||
        ((rec.status === 'pending' || rec.status === 'partial') && isBefore(new Date(rec.dueDate), startOfDay(new Date())));
      const isTodayRec =
        (rec.status === 'pending' || rec.status === 'partial') &&
        format(new Date(rec.dueDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      if (isOverdue) {
        group.overdueCount += 1;
        group.totalOverdue += Number(rec.originalAmount);
      } else if (isTodayRec) {
        group.todayCount += 1;
      }
    });
    return Array.from(map.values()).filter(
      (g) =>
        g.customerName.toLowerCase().includes(search.toLowerCase()) ||
        g.customerPhone.includes(search)
    );
  }, [billingRecords, search]);

  if (isLoading) return <Loading />;

  // ── render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Cobrança</h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              <FiDownload size={16} />
              {exportingPdf ? 'Gerando...' : 'Exportar PDF'}
            </Button>
            <Button
              variant="primary"
              className="flex items-center gap-2"
              onClick={() => setIsSendChargesModalOpen(true)}
            >
              <FiSend size={16} />
              Disparar Cobranças Manualmente
            </Button>
          </div>
        </div>

        {/* 4 KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary bg-opacity-10 text-primary rounded-lg">
                <FiTrendingUp size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Total a Receber</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {((stats?.overdue?.total || 0) + (stats?.pendingToday?.total || 0) + (stats?.inDay?.total || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-error bg-opacity-10 text-error rounded-lg">
                <FiAlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Em Atraso</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {(stats?.overdue?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stats?.overdue?.count || 0} parcelas</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success bg-opacity-10 text-success rounded-lg">
                <FiCheckCircle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Recebido</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {(billingRecords || []).reduce((s, r) => s + (r.status === 'paid' ? Number(r.paidAmount || 0) : 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary bg-opacity-10 text-secondary rounded-lg">
                <FiClock size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Pendente</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats?.pendingToday?.count || 0) + (stats?.inDay?.count || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">parcelas</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('parcelas')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === 'parcelas'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FiList size={16} />
            Parcelas por Cliente
          </button>
          <button
            onClick={() => setActiveTab('mensagens')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === 'mensagens'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FiMessageCircle size={16} />
            Mensagens Enviadas
          </button>
        </div>

        {/* ─── TAB: Parcelas por Cliente ─── */}
        {activeTab === 'parcelas' && (
          <>
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Buscar cliente..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value === '') setSearch('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearch(searchInput);
                }}
                className="max-w-xs"
                icon={<FiSearch />}
              />
            </div>

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
                      <div
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                        onClick={() => setExpandedCustomer(isExpanded ? null : group.customerId)}
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
                          {group.overdueCount === 0 && group.todayCount > 0 && (
                            <Badge variant="warning">Vence hoje</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-gray-400">
                          <span className="text-sm text-gray-500">{group.installments.length} parcelas</span>
                          {isExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                          {group.installments.map((inst) => {
                            const isOverdue =
                              inst.status === 'overdue' ||
                              ((inst.status === 'pending' || inst.status === 'partial') && isBefore(new Date(inst.dueDate), startOfDay(new Date())));
                            const isToday =
                              format(new Date(inst.dueDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') &&
                              (inst.status === 'pending' || inst.status === 'partial');
                            return (
                              <Card key={inst.id} className="p-4 hover:shadow-md transition">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="font-semibold text-gray-900">Parcela {inst.installmentNumber}</span>
                                      <Badge
                                        variant={
                                          inst.status === 'paid' ? 'success'
                                          : inst.status === 'partial' ? 'warning'
                                          : isOverdue ? 'error'
                                          : isToday ? 'warning'
                                          : 'default'
                                        }
                                      >
                                        {inst.status === 'paid' ? 'Paga'
                                          : inst.status === 'partial' ? `Parcial - Pago R$ ${Number(inst.paidAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${Number(inst.originalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                          : isOverdue ? 'Atrasada'
                                          : isToday ? 'Vence hoje'
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
                                    <Button onClick={() => handleOpenEditDate(inst)} variant="secondary" className="flex items-center gap-2">
                                      <FiEdit size={16} />
                                      Editar Data
                                    </Button>
                                    {inst.status !== 'paid' && (
                                      <Button onClick={() => handleOpenPayment(inst)} className="flex items-center gap-2">
                                        <FiDollarSign size={16} />
                                        Pagar
                                      </Button>
                                    )}
                                    {inst.status === 'paid' && (
                                      <Button onClick={() => revertMutation.mutate(inst.id)} variant="secondary" className="flex items-center gap-2">
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
          </>
        )}

        {/* ─── TAB: Mensagens Enviadas ─── */}
        {activeTab === 'mensagens' && (
          <>
            <div className="flex items-center gap-2 mb-4">
              {(['today', '7d', '30d'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setMessagesPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    messagesPeriod === p
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {p === 'today' ? 'Hoje' : p === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
                </button>
              ))}
            </div>

            {isLoadingMessages ? (
              <Loading />
            ) : billingMessages.length === 0 ? (
              <Card className="text-center py-8 text-gray-500">
                Nenhuma mensagem de cobrança enviada no período selecionado.
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Telefone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mensagem</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Horário</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {billingMessages.map((msg) => (
                        <tr key={msg.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{msg.customerName}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{msg.phone}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={msg.content}>
                            {msg.content}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Badge variant={msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read' ? 'success' : 'error'}>
                              {msg.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {msg.timestamp ? format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ─── Modal: Disparar Cobranças ─── */}
        <Modal
          isOpen={isSendChargesModalOpen}
          onClose={() => setIsSendChargesModalOpen(false)}
          title="Disparar Cobranças Manualmente"
        >
          <div className="space-y-4">
            {isLoadingPreview ? (
              <Loading />
            ) : (
              <>
                <p className="text-gray-600">Serão enviadas mensagens WhatsApp para:</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{chargesPreview?.todayCount ?? 0}</p>
                    <p className="text-sm text-yellow-600 mt-1">Vencendo hoje</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{chargesPreview?.overdueCount ?? 0}</p>
                    <p className="text-sm text-red-600 mt-1">Em atraso</p>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-gray-800">
                    Total: {chargesPreview?.totalCount ?? 0} mensagens
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  Cada cliente receberá uma mensagem via WhatsApp com o template de cobrança configurado.
                </p>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsSendChargesModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={sendChargesMutation.isPending}
                onClick={() => sendChargesMutation.mutate()}
                className="flex items-center gap-2"
              >
                <FiSend size={16} />
                Confirmar e Disparar
              </Button>
            </div>
          </div>
        </Modal>

        {/* ─── Modal: Pagamento ─── */}
        <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Registrar Pagamento">
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
              <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value))} step="0.01" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data do pagamento</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" loading={payMutation.isPending}>Confirmar Pagamento</Button>
            </div>
          </form>
        </Modal>

        {/* ─── Modal: Editar Data ─── */}
        <Modal isOpen={isEditDateModalOpen} onClose={() => setIsEditDateModalOpen(false)} title="Editar Data de Vencimento">
          <form onSubmit={handleConfirmEditDate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nova Data de Vencimento</label>
              <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsEditDateModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" loading={editDateMutation.isPending}>Salvar Data</Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
};
