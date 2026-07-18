import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FiPlus, FiChevronLeft, FiChevronRight, FiEdit2, FiTrash2,
  FiCheckCircle, FiRotateCcw, FiAlertTriangle, FiClock,
  FiDollarSign, FiRepeat, FiPaperclip, FiX,
} from 'react-icons/fi';
import api from '../../services/api';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type Category = 'fixas' | 'fornecedores' | 'salarios' | 'impostos' | 'outras';
type PayableStatus = 'pending' | 'overdue' | 'paid';

interface Payable {
  id: string;
  recurrenceId: string | null;
  description: string;
  category: Category;
  amount: number | null;
  dueDate: string;
  status: PayableStatus;
  paidAt: string | null;
  paidAmount: number | null;
  notes: string | null;
  boletoFilename: string | null;
  boletoMimetype: string | null;
  boletoSize: number | null;
  boletoUploadedAt: string | null;
}

interface Recurrence {
  id: string;
  description: string;
  category: Category;
  amount: string | null;
  isVariable: boolean;
  dueDay: number;
  active: boolean;
  notes: string | null;
}

interface Summary {
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  dueSoonCount: number;
  paidThisMonth: number;
}

const CATEGORY_LABELS: Record<Category, string> = {
  fixas: 'Fixas',
  fornecedores: 'Fornecedores',
  salarios: 'Salários',
  impostos: 'Impostos',
  outras: 'Outras',
};

const CATEGORY_COLORS: Record<Category, string> = {
  fixas: 'bg-blue-100 text-blue-700',
  fornecedores: 'bg-purple-100 text-purple-700',
  salarios: 'bg-indigo-100 text-indigo-700',
  impostos: 'bg-orange-100 text-orange-700',
  outras: 'bg-gray-100 text-gray-600',
};

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ─── Modal: Create/Edit Payable ───────────────────────────────────────────────

interface PayableModalProps {
  initial?: Payable | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}

const PayableModal: React.FC<PayableModalProps> = ({ initial, onClose, onSave, saving }) => {
  const [form, setForm] = useState({
    description: initial?.description ?? '',
    category: (initial?.category ?? 'fixas') as Category,
    amount: initial?.amount != null ? String(initial.amount) : '',
    dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
    notes: initial?.notes ?? '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      description: form.description,
      category: form.category,
      amount: form.amount !== '' ? Number(form.amount) : null,
      dueDate: form.dueDate,
      notes: form.notes || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          {initial ? 'Editar Conta' : 'Nova Conta a Pagar'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <input required type="text" value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map(k => (
                  <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (vazio = variável)</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="R$ 0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
            <input required type="date" value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Modal: Pay ───────────────────────────────────────────────────────────────

interface PayModalProps {
  payable: Payable;
  onClose: () => void;
  onConfirm: (paidAmount: number, paidAt: string) => void;
  saving: boolean;
}

const PayModal: React.FC<PayModalProps> = ({ payable, onClose, onConfirm, saving }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [paidAmount, setPaidAmount] = useState(payable.amount != null ? String(payable.amount) : '');
  const [paidAt, setPaidAt] = useState(today);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(Number(paidAmount), paidAt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Registrar Pagamento</h2>
        <p className="text-sm text-gray-500 mb-4">{payable.description}</p>

        {payable.boletoFilename && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>⚠️ Atenção:</strong> Ao marcar como paga, o boleto anexado
            (<strong>{payable.boletoFilename}</strong>) será removido automaticamente.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor pago *</label>
            <input required type="number" min="0.01" step="0.01" value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento *</label>
            <input required type="date" value={paidAt}
              onChange={e => setPaidAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Confirmar Pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Modal: Create/Edit Recurrence ───────────────────────────────────────────

interface RecurrenceModalProps {
  initial?: Recurrence | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}

const RecurrenceModal: React.FC<RecurrenceModalProps> = ({ initial, onClose, onSave, saving }) => {
  const [form, setForm] = useState({
    description: initial?.description ?? '',
    category: (initial?.category ?? 'fixas') as Category,
    amount: initial?.amount != null ? String(parseFloat(String(initial.amount))) : '',
    isVariable: initial?.isVariable ?? false,
    dueDay: initial?.dueDay ? String(initial.dueDay) : '10',
    notes: initial?.notes ?? '',
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      description: form.description,
      category: form.category,
      amount: !form.isVariable && form.amount !== '' ? Number(form.amount) : null,
      isVariable: form.isVariable,
      dueDay: Number(form.dueDay),
      notes: form.notes || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          {initial ? 'Editar Recorrência' : 'Nova Recorrência'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <input required type="text" value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map(k => (
                  <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dia de vencimento *</label>
              <input required type="number" min={1} max={31} value={form.dueDay}
                onChange={e => set('dueDay', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isVariable" checked={form.isVariable}
              onChange={e => set('isVariable', e.target.checked)} className="h-4 w-4" />
            <label htmlFor="isVariable" className="text-sm text-gray-700">Valor variável (definido a cada mês)</label>
          </div>
          {!form.isVariable && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor fixo</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="R$ 0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const Payables: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<'payables' | 'recurrences'>('payables');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showPayableModal, setShowPayableModal] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);
  const [payingPayable, setPayingPayable] = useState<Payable | null>(null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState<Recurrence | null>(null);

  // Hidden file input for boleto upload; uploadTargetId tracks which payable
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  if (user && user.role !== 'admin') return <Navigate to="/dashboard" />;

  const navigateMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payables'] });
    queryClient.invalidateQueries({ queryKey: ['payables-summary'] });
  };

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: payablesList = [], isLoading: loadingPayables } = useQuery<Payable[]>({
    queryKey: ['payables', month, year, search, categoryFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ month: String(month), year: String(year) });
      if (search) p.append('search', search);
      if (categoryFilter) p.append('category', categoryFilter);
      const res = await api.get(`/payables?${p}`);
      return res.data;
    },
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['payables-summary', month, year],
    queryFn: async () => {
      const res = await api.get(`/payables/summary?month=${month}&year=${year}`);
      return res.data;
    },
  });

  const { data: recurrences = [], isLoading: loadingRecurrences } = useQuery<Recurrence[]>({
    queryKey: ['payable-recurrences'],
    queryFn: async () => {
      const res = await api.get('/payables/recurrences?includeInactive=true');
      return res.data;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createPayable = useMutation({
    mutationFn: (d: any) => api.post('/payables', d),
    onSuccess: () => { invalidate(); setShowPayableModal(false); },
  });

  const updatePayable = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/payables/${id}`, d),
    onSuccess: () => { invalidate(); setEditingPayable(null); },
  });

  const payPayable = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/payables/${id}/pay`, d),
    onSuccess: () => { invalidate(); setPayingPayable(null); },
  });

  const revertPayable = useMutation({
    mutationFn: (id: string) => api.patch(`/payables/${id}/revert`),
    onSuccess: () => invalidate(),
  });

  const deletePayable = useMutation({
    mutationFn: (id: string) => api.delete(`/payables/${id}`),
    onSuccess: () => invalidate(),
  });

  const uploadBoleto = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. Limite: 5MB.');
      const formData = new FormData();
      formData.append('boleto', file);
      await api.post(`/payables/${id}/boleto`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => invalidate(),
    onError: (err: any) => alert(err?.response?.data?.message ?? err?.message ?? 'Erro ao anexar boleto.'),
  });

  const removeBoleto = useMutation({
    mutationFn: (id: string) => api.delete(`/payables/${id}/boleto`),
    onSuccess: () => invalidate(),
  });

  const createRecurrence = useMutation({
    mutationFn: (d: any) => api.post('/payables/recurrences', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payable-recurrences'] }); setShowRecurrenceModal(false); },
  });

  const updateRecurrence = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/payables/recurrences/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payable-recurrences'] }); setEditingRecurrence(null); },
  });

  const deleteRecurrence = useMutation({
    mutationFn: (id: string) => api.delete(`/payables/recurrences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payable-recurrences'] }),
  });

  // ── Boleto helpers ────────────────────────────────────────────────────────────

  const handleBoletoUploadClick = (payableId: string) => {
    setUploadTargetId(payableId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadTargetId) {
      uploadBoleto.mutate({ id: uploadTargetId, file });
    }
    // reset so same file can be re-selected if needed
    e.target.value = '';
  };

  const openBoleto = async (payableId: string, filename: string) => {
    try {
      const res = await api.get(`/payables/${payableId}/boleto`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const win = window.open(url, '_blank');
      // revoke after a short delay to allow the tab to load
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!win) alert('Permita pop-ups para visualizar o boleto.');
    } catch {
      alert('Erro ao abrir boleto.');
    }
  };

  // ── Row styling ───────────────────────────────────────────────────────────────

  const getRowBg = (p: Payable) => {
    if (p.status === 'paid') return 'bg-green-50';
    if (p.status === 'overdue') return 'bg-red-50';
    const diff = Math.floor((new Date(p.dueDate).getTime() - Date.now()) / 86400000);
    if (diff >= 0 && diff <= 3) return 'bg-yellow-50';
    return '';
  };

  return (
    <div className="p-6">
      {/* Hidden file input for boleto upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FiDollarSign size={24} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Contas a Pagar</h1>
            <p className="text-sm text-gray-500">Gestão de despesas e contas recorrentes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowRecurrenceModal(true); setEditingRecurrence(null); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
          >
            <FiRepeat size={16} /> Nova Recorrência
          </button>
          <button
            onClick={() => { setShowPayableModal(true); setEditingPayable(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 text-sm"
          >
            <FiPlus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-4 mb-5">
        <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-gray-100 rounded">
          <FiChevronLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-gray-800 w-44 text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-gray-100 rounded">
          <FiChevronRight size={20} />
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">Pendente</p>
            <p className="text-xl font-bold text-gray-800">{fmtBRL(summary.pendingAmount)}</p>
          </div>
          <div className={`rounded-xl shadow-sm p-4 ${summary.overdueCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <FiAlertTriangle size={12} className="text-red-500" /> Vencidas
            </p>
            <p className="text-xl font-bold text-red-700">{summary.overdueCount} conta{summary.overdueCount !== 1 ? 's' : ''}</p>
            <p className="text-xs text-red-500">{fmtBRL(summary.overdueAmount)}</p>
          </div>
          <div className={`rounded-xl shadow-sm p-4 ${summary.dueSoonCount > 0 ? 'bg-yellow-50' : 'bg-white'}`}>
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <FiClock size={12} className="text-yellow-600" /> Vence em 3 dias
            </p>
            <p className="text-xl font-bold text-yellow-700">{summary.dueSoonCount} conta{summary.dueSoonCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <FiCheckCircle size={12} className="text-green-600" /> Pago no mês
            </p>
            <p className="text-xl font-bold text-green-700">{fmtBRL(summary.paidThisMonth)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {(['payables', 'recurrences'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'payables' ? 'Contas do Mês' : 'Recorrências'}
          </button>
        ))}
      </div>

      {/* Tab: Payables */}
      {tab === 'payables' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <input type="text" placeholder="Buscar por descrição..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Todas as categorias</option>
              {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Vencimento</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Boleto</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayables ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Carregando...</td></tr>
                ) : payablesList.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">
                    Nenhuma conta encontrada para {MONTH_NAMES[month - 1]}/{year}.
                  </td></tr>
                ) : (
                  payablesList.map(p => (
                    <tr key={p.id} className={`border-b border-gray-100 hover:brightness-95 transition-colors ${getRowBg(p)}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{p.description}</span>
                        {p.recurrenceId && (
                          <span className="ml-2 text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded"
                            title="Gerada por recorrência">
                            <FiRepeat size={10} className="inline" />
                          </span>
                        )}
                        {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[p.category]}`}>
                          {CATEGORY_LABELS[p.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'paid' && p.paidAmount != null ? (
                          <span className="text-green-700 font-semibold">{fmtBRL(p.paidAmount)}</span>
                        ) : p.amount != null ? (
                          <span className="font-semibold text-gray-800">{fmtBRL(p.amount)}</span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">⚠️ Aguardando valor</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{fmtDate(p.dueDate)}</td>
                      <td className="px-4 py-3 text-center">
                        {p.status === 'paid' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">✓ Pago</span>
                        ) : p.status === 'overdue' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Vencida</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Pendente</span>
                        )}
                      </td>

                      {/* Boleto column */}
                      <td className="px-4 py-3 text-center">
                        {p.boletoFilename ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openBoleto(p.id, p.boletoFilename!)}
                              title={`Abrir: ${p.boletoFilename}`}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <FiPaperclip size={13} />
                              <span className="max-w-[80px] truncate">{p.boletoFilename}</span>
                            </button>
                            {p.status !== 'paid' && (
                              <button
                                onClick={() => { if (confirm('Remover boleto anexado?')) removeBoleto.mutate(p.id); }}
                                title="Remover boleto"
                                className="p-0.5 text-gray-400 hover:text-red-500 rounded"
                              >
                                <FiX size={13} />
                              </button>
                            )}
                          </div>
                        ) : p.status !== 'paid' ? (
                          <button
                            onClick={() => handleBoletoUploadClick(p.id)}
                            title="Anexar boleto (PDF, JPEG, PNG, WebP · máx. 5MB)"
                            className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-primary mx-auto"
                          >
                            <FiPaperclip size={13} />
                            <span>Anexar</span>
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions column */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {p.status !== 'paid' && (
                            <>
                              <button onClick={() => setPayingPayable(p)} title="Registrar pagamento"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                                <FiCheckCircle size={16} />
                              </button>
                              <button onClick={() => setEditingPayable(p)} title="Editar"
                                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                                <FiEdit2 size={16} />
                              </button>
                            </>
                          )}
                          {p.status === 'paid' && (
                            <button
                              onClick={() => { if (confirm('Reverter pagamento?')) revertPayable.mutate(p.id); }}
                              title="Reverter pagamento"
                              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded">
                              <FiRotateCcw size={16} />
                            </button>
                          )}
                          {p.status !== 'paid' && (
                            <button
                              onClick={() => { if (confirm('Excluir esta conta?')) deletePayable.mutate(p.id); }}
                              title="Excluir"
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                              <FiTrash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-200"></span> Vencida</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-200"></span> Vence em 3 dias</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-200"></span> Paga</span>
            <span className="flex items-center gap-1 ml-2"><FiPaperclip size={11} /> Clique no nome do arquivo para abrir o boleto em nova aba</span>
          </div>
        </>
      )}

      {/* Tab: Recurrences */}
      {tab === 'recurrences' && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Descrição</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Dia</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecurrences ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Carregando...</td></tr>
              ) : recurrences.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Nenhuma recorrência cadastrada.</td></tr>
              ) : (
                recurrences.map(r => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!r.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{r.description}</span>
                      {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[r.category]}`}>
                        {CATEGORY_LABELS[r.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">Dia {r.dueDay}</td>
                    <td className="px-4 py-3 text-right">
                      {r.isVariable ? (
                        <span className="text-xs text-gray-400 italic">Variável</span>
                      ) : r.amount != null ? (
                        <span className="font-semibold text-gray-800">{fmtBRL(parseFloat(String(r.amount)))}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateRecurrence.mutate({ id: r.id, active: !r.active })}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded text-xs">
                          {r.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => setEditingRecurrence(r)} title="Editar"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                          <FiEdit2 size={16} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Excluir esta recorrência? As contas já geradas não serão afetadas.')) deleteRecurrence.mutate(r.id); }}
                          title="Excluir" className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showPayableModal && (
        <PayableModal initial={null} onClose={() => setShowPayableModal(false)}
          onSave={d => createPayable.mutate(d)} saving={createPayable.isPending} />
      )}
      {editingPayable && (
        <PayableModal initial={editingPayable} onClose={() => setEditingPayable(null)}
          onSave={d => updatePayable.mutate({ id: editingPayable.id, ...d })}
          saving={updatePayable.isPending} />
      )}
      {payingPayable && (
        <PayModal payable={payingPayable} onClose={() => setPayingPayable(null)}
          onConfirm={(paidAmount, paidAt) => payPayable.mutate({ id: payingPayable.id, paidAmount, paidAt })}
          saving={payPayable.isPending} />
      )}
      {showRecurrenceModal && (
        <RecurrenceModal initial={null} onClose={() => setShowRecurrenceModal(false)}
          onSave={d => createRecurrence.mutate(d)} saving={createRecurrence.isPending} />
      )}
      {editingRecurrence && (
        <RecurrenceModal initial={editingRecurrence} onClose={() => setEditingRecurrence(null)}
          onSave={d => updateRecurrence.mutate({ id: editingRecurrence.id, ...d })}
          saving={updateRecurrence.isPending} />
      )}
    </div>
  );
};
