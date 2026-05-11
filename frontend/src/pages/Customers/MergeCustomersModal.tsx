import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiX, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { Button, Modal } from '../../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email?: string;
  cep?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
}

interface MergeResult {
  primaryId: string;
  installments: number;
  sales: number;
  messages: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Side = 'A' | 'B';

// ─── Field definitions ────────────────────────────────────────────────────────

function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length <= 10) return local.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return local.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

const FIELDS: Array<{ key: keyof Customer; label: string; format?: (v: string) => string }> = [
  { key: 'name',                label: 'Nome' },
  { key: 'cpf',                 label: 'CPF' },
  { key: 'phone',               label: 'Telefone', format: displayPhone },
  { key: 'email',               label: 'E-mail' },
  { key: 'cep',                 label: 'CEP' },
  { key: 'addressStreet',       label: 'Rua' },
  { key: 'addressNumber',       label: 'Número' },
  { key: 'addressNeighborhood', label: 'Bairro' },
  { key: 'addressCity',         label: 'Cidade' },
  { key: 'addressState',        label: 'Estado' },
];

// ─── CustomerSearch sub-component ────────────────────────────────────────────

function CustomerSearch({
  selected,
  onSelect,
  exclude,
  colorClass,
}: {
  selected: Customer | null;
  onSelect: (c: Customer | null) => void;
  exclude?: string;
  colorClass: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['customer-search-merge', search],
    queryFn: async () => {
      if (!search.trim()) return { data: [] };
      const res = await api.get('/customers', { params: { search, limit: 8 } });
      return res.data;
    },
    enabled: !!search.trim(),
  });

  const results = ((data?.data ?? []) as Customer[]).filter(c => c.id !== exclude);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selected) {
    return (
      <div className={`p-3 border-2 rounded-lg flex items-center justify-between gap-3 ${colorClass}`}>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{selected.name}</p>
          <p className="text-xs text-gray-500 truncate">{displayPhone(selected.phone)} · {selected.cpf}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
        >
          <FiX size={18} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou telefone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
        />
      </div>
      {open && search.trim() && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">Nenhum cliente encontrado</p>
          ) : results.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-b-0"
              onMouseDown={() => { onSelect(c); setSearch(''); setOpen(false); }}
            >
              <p className="font-medium text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-500">{displayPhone(c.phone)} · {c.cpf}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MergeCustomersModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();

  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [customerA, setCustomerA] = useState<Customer | null>(null); // duplicado
  const [customerB, setCustomerB] = useState<Customer | null>(null); // principal
  const [selections, setSelections] = useState<Record<string, Side>>(
    () => Object.fromEntries(FIELDS.map(f => [f.key, 'B']))
  );
  const [preview, setPreview]           = useState<{ installments: number; sales: number; messages: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mergeResult, setMergeResult]   = useState<MergeResult | null>(null);

  const reset = () => {
    setStep(1);
    setCustomerA(null);
    setCustomerB(null);
    setSelections(Object.fromEntries(FIELDS.map(f => [f.key, 'B'])));
    setPreview(null);
    setMergeResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const mergeMutation = useMutation({
    mutationFn: (body: any) => api.post('/customers/merge', body),
    onSuccess: (res) => {
      setMergeResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: any) => {
      alert(`Erro ao mesclar: ${error.response?.data?.message || error.message}`);
    },
  });

  const goToStep3 = async () => {
    setLoadingPreview(true);
    try {
      const res = await api.get(`/customers/merge-preview/${customerB!.id}/${customerA!.id}`);
      setPreview(res.data);
      setStep(3);
    } catch (err: any) {
      alert(`Erro: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Build merged data from current selections
  const mergedData = FIELDS.reduce((acc, field) => {
    const src = selections[field.key] === 'A' ? customerA : customerB;
    acc[field.key as string] = src?.[field.key] ?? null;
    return acc;
  }, {} as Record<string, any>);

  const handleMerge = () => {
    mergeMutation.mutate({
      primaryCustomerId: customerB!.id,
      duplicateCustomerId: customerA!.id,
      mergedData,
    });
  };

  const sameSelected = !!(customerA && customerB && customerA.id === customerB.id);

  // ── Success screen ──────────────────────────────────────────────────────────
  if (mergeResult) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Mesclagem Concluída" size="md">
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <FiCheck size={32} className="text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Clientes mesclados com sucesso!</h3>
          <p className="text-sm text-gray-500 mb-4">
            {mergeResult.installments} parcelas, {mergeResult.sales} vendas e {mergeResult.messages} mensagens transferidas.
          </p>
          <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-6">
            O cliente duplicado foi arquivado permanentemente.
          </div>
          <Button onClick={handleClose}>Fechar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Mesclar Clientes — Passo ${step} de 3`} size="2xl">

      {/* ── Step 1: Select customers ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Selecione o cliente duplicado (será arquivado) e o cliente principal (será mantido com todos os dados transferidos).
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">A</span>
                Cliente Duplicado
                <span className="text-xs text-gray-400">(será arquivado)</span>
              </p>
              <CustomerSearch
                selected={customerA}
                onSelect={setCustomerA}
                exclude={customerB?.id}
                colorClass="border-amber-300 bg-amber-50"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">B</span>
                Cliente Principal
                <span className="text-xs text-gray-400">(será mantido)</span>
              </p>
              <CustomerSearch
                selected={customerB}
                onSelect={setCustomerB}
                exclude={customerA?.id}
                colorClass="border-green-300 bg-green-50"
              />
            </div>
          </div>

          {sameSelected && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <FiAlertTriangle size={14} /> Os dois clientes precisam ser diferentes.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setStep(2)}
              disabled={!customerA || !customerB || sameSelected}
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Choose fields ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Clique em cada valor para escolher qual ficará no cliente final. Por padrão o cliente principal (B) é selecionado.
          </p>

          <div className="overflow-y-auto max-h-[380px] border border-gray-200 rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Campo</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold w-[44%]">
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">A</span>
                    <span className="ml-1.5 text-gray-700 font-medium">{customerA?.name}</span>
                    <span className="text-gray-400 font-normal ml-1">(duplicado)</span>
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold w-[44%]">
                    <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">B</span>
                    <span className="ml-1.5 text-gray-700 font-medium">{customerB?.name}</span>
                    <span className="text-gray-400 font-normal ml-1">(principal)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(field => {
                  const rawA = customerA?.[field.key];
                  const rawB = customerB?.[field.key];
                  const valA = rawA ? (field.format ? field.format(rawA) : rawA) : '—';
                  const valB = rawB ? (field.format ? field.format(rawB) : rawB) : '—';
                  const selA = selections[field.key] === 'A';
                  const selB = selections[field.key] === 'B';

                  return (
                    <tr key={field.key} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-1.5 px-3 text-xs font-medium text-gray-500">{field.label}</td>
                      <td className="py-1 px-1.5">
                        <button
                          onClick={() => setSelections(s => ({ ...s, [field.key]: 'A' }))}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-sm transition-all ${
                            selA
                              ? 'bg-amber-100 border-2 border-amber-400 font-semibold text-amber-900'
                              : 'border-2 border-transparent hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          {valA}
                          {selA && <span className="ml-1 text-amber-600 text-xs">✓</span>}
                        </button>
                      </td>
                      <td className="py-1 px-1.5">
                        <button
                          onClick={() => setSelections(s => ({ ...s, [field.key]: 'B' }))}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-sm transition-all ${
                            selB
                              ? 'bg-green-100 border-2 border-green-400 font-semibold text-green-900'
                              : 'border-2 border-transparent hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          {valB}
                          {selB && <span className="ml-1 text-green-600 text-xs">✓</span>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>← Voltar</Button>
            <Button onClick={goToStep3} disabled={loadingPreview}>
              {loadingPreview ? 'Carregando...' : 'Próximo →'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Summary & confirm ─────────────────────────────────────────── */}
      {step === 3 && preview && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-semibold text-amber-900 mb-2">O que será feito:</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• <strong>{preview.installments}</strong> parcela(s) transferida(s) para <strong>{customerB?.name}</strong></li>
              <li>• <strong>{preview.sales}</strong> venda(s) transferida(s) para <strong>{customerB?.name}</strong></li>
              <li>• <strong>{preview.messages}</strong> mensagem(ns) transferida(s) para <strong>{customerB?.name}</strong></li>
              <li>• Cliente <strong>{customerA?.name}</strong> será arquivado permanentemente</li>
            </ul>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Dados finais do cliente principal:</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {FIELDS.filter(f => mergedData[f.key as string]).map(f => (
                <div key={f.key} className="flex gap-1">
                  <span className="text-gray-500 shrink-0">{f.label}:</span>
                  <span className="font-medium truncate">
                    {f.format ? f.format(mergedData[f.key as string]) : mergedData[f.key as string]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <FiAlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>Esta ação é <strong>irreversível</strong>. O cliente duplicado será arquivado e não poderá ser restaurado.</span>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(2)}>← Voltar</Button>
            <Button
              variant="danger"
              onClick={handleMerge}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? 'Mesclando...' : 'Confirmar Mesclagem'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
