import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Modal, Button } from '../../components/ui';
import { FiUpload, FiAlertTriangle, FiCheck } from 'react-icons/fi';

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedNfItem {
  code: string;
  description: string;
  ncm: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  suggestedProductId: string | null;
}

interface ParsedNf {
  nfNumber: string | null;
  nfSeries: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  accessKey: string | null;
  nfDate: string | null;
  totalProducts: number | null;
  validationError: string | null;
  duplicateImport: { id: string; createdAt: string } | null;
  itemsWithSuggestions: ParsedNfItem[];
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
}

interface PaginatedProducts {
  data: ProductOption[];
}

interface ConfirmResult {
  nfImportId: string;
  updatedProducts: Array<{ productId: string; productName: string; addedQty: number; newQty: number; newCost: number }>;
  newProducts: Array<{ productId: string; productName: string; sku: string; quantity: number }>;
  skippedCount: number;
}

type ItemAction =
  | { action: 'pending' }
  | { action: 'ignore' }
  | { action: 'existing'; productId: string }
  | { action: 'new'; newProductName: string };

// CNPJs aceitos como destinatário
const OUR_CNPJS = ['47401804000166', '38143602000170'];

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NfImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedNf, setParsedNf] = useState<ParsedNf | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ItemAction>>({});
  const [reimport, setReiport] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setFile(null); setParsedNf(null);
      setDecisions({}); setReiport(false); setResult(null);
    }
  }, [isOpen]);

  // Load catalog products only when needed in step 2
  const { data: allProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ['products-nf-options'],
    queryFn: async () => {
      const res = await api.get<PaginatedProducts>('/products', { params: { limit: 500 } });
      return res.data.data ?? [];
    },
    enabled: isOpen && step === 2,
    staleTime: 5 * 60 * 1000,
  });

  // ── Decision helpers ────────────────────────────────────────────────────────

  const getDecision = (code: string): ItemAction => decisions[code] ?? { action: 'pending' };

  const getSelectValue = (code: string): string => {
    const d = getDecision(code);
    if (d.action === 'ignore') return '__IGNORE__';
    if (d.action === 'new') return '__NEW__';
    if (d.action === 'existing') return d.productId;
    return '';
  };

  const handleSelect = (code: string, defaultName: string, value: string) => {
    if (value === '') {
      setDecisions(p => ({ ...p, [code]: { action: 'pending' } }));
    } else if (value === '__IGNORE__') {
      setDecisions(p => ({ ...p, [code]: { action: 'ignore' } }));
    } else if (value === '__NEW__') {
      setDecisions(p => ({ ...p, [code]: { action: 'new', newProductName: defaultName } }));
    } else {
      setDecisions(p => ({ ...p, [code]: { action: 'existing', productId: value } }));
    }
  };

  const setNewProductName = (code: string, name: string) => {
    setDecisions(p => ({ ...p, [code]: { action: 'new', newProductName: name } }));
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const items = parsedNf?.itemsWithSuggestions ?? [];
  const pendingCount = items.filter(i => getDecision(i.code).action === 'pending').length;
  const allDecided = pendingCount === 0 && items.length > 0;

  // ── Mutations ───────────────────────────────────────────────────────────────

  const parseMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append('nf', f);
      const res = await api.post<ParsedNf>('/nf-import/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setParsedNf(data);
      // Pre-fill decisions from suggestions
      const initial: Record<string, ItemAction> = {};
      for (const item of data.itemsWithSuggestions) {
        if (item.suggestedProductId) {
          initial[item.code] = { action: 'existing', productId: item.suggestedProductId };
        }
      }
      setDecisions(initial);
      setStep(2);
    },
    onError: (err: any) => alert(err?.response?.data?.message || 'Erro ao processar o PDF da nota fiscal.'),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!parsedNf) throw new Error('Sem dados de NF');
      const payload = {
        filename: file?.name ?? 'nota.pdf',
        accessKey: parsedNf.accessKey,
        nfNumber: parsedNf.nfNumber,
        nfSeries: parsedNf.nfSeries,
        supplierCnpj: parsedNf.supplierCnpj,
        supplierName: parsedNf.supplierName,
        nfDate: parsedNf.nfDate,
        totalProducts: parsedNf.totalProducts,
        reimport,
        items: parsedNf.itemsWithSuggestions.map(item => {
          const d = getDecision(item.code);
          return {
            supplierCode: item.code,
            supplierDescription: item.description,
            ncm: item.ncm,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: item.totalCost,
            action: d.action === 'pending' ? 'ignore' : d.action,
            productId: d.action === 'existing' ? d.productId : null,
            newProductName: d.action === 'new' ? d.newProductName : null,
          };
        }),
      };
      const res = await api.post<ConfirmResult>('/nf-import/confirm', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
      onSuccess();
    },
    onError: (err: any) => alert(err?.response?.data?.message || 'Erro ao confirmar importação.'),
  });

  // ── Warnings ────────────────────────────────────────────────────────────────

  const cnpjMismatch = parsedNf?.recipientCnpj && !OUR_CNPJS.includes(parsedNf.recipientCnpj);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Importar Nota Fiscal — Passo ${step}/3`} size="xl">

      {/* ── Passo 1: Upload ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800 flex items-center gap-2">
            <FiCheck size={15} className="flex-shrink-0" />
            <span><strong>Prefira o XML</strong> quando disponível — é padronizado pela Receita Federal e mais confiável que o PDF.</span>
          </div>
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-primary transition-colors">
            <FiUpload className="text-gray-400" size={40} />
            <span className="text-gray-600 text-sm">Clique para selecionar o XML ou PDF da NF-e</span>
            <span className="text-xs text-gray-400">.xml (recomendado) · .pdf</span>
            <input
              type="file"
              accept=".xml,.pdf,text/xml,application/xml,application/pdf"
              className="sr-only"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded px-3 py-2">
              📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => file && parseMutation.mutate(file)}
              loading={parseMutation.isPending}
              disabled={!file}
            >
              {parseMutation.isPending ? 'Analisando...' : 'Analisar Nota'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Passo 2: Mapeamento ── */}
      {step === 2 && parsedNf && (
        <div className="space-y-3">

          {/* Metadados */}
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {parsedNf.nfNumber && <div><span className="text-gray-500">NF nº </span><strong>{parsedNf.nfNumber}{parsedNf.nfSeries ? ` · Série ${parsedNf.nfSeries}` : ''}</strong></div>}
            {parsedNf.supplierName && <div className="truncate"><span className="text-gray-500">Fornecedor: </span><strong>{parsedNf.supplierName}</strong></div>}
            {parsedNf.supplierCnpj && <div><span className="text-gray-500">CNPJ forn.: </span><strong>{formatCnpj(parsedNf.supplierCnpj)}</strong></div>}
            {parsedNf.nfDate && <div><span className="text-gray-500">Emissão: </span><strong>{new Date(parsedNf.nfDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>}
            {parsedNf.totalProducts !== null && <div><span className="text-gray-500">Total produtos: </span><strong>{fmt(parsedNf.totalProducts)}</strong></div>}
          </div>

          {/* Alertas */}
          {parsedNf.duplicateImport && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <div className="font-semibold text-red-800 flex items-center gap-2">
                <FiAlertTriangle size={16} /> Esta nota já foi importada anteriormente!
              </div>
              <div className="text-red-700 mt-0.5">
                Importada em {new Date(parsedNf.duplicateImport.createdAt).toLocaleDateString('pt-BR')}. Continuar somará o estoque novamente.
              </div>
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-red-800 font-medium">
                <input type="checkbox" checked={reimport} onChange={e => setReiport(e.target.checked)} />
                Quero reimportar mesmo assim
              </label>
            </div>
          )}

          {cnpjMismatch && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <FiAlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
              <span>
                O CNPJ do destinatário ({formatCnpj(parsedNf.recipientCnpj!)}) não corresponde ao da loja.
                Confirme se esta nota é sua antes de importar.
              </span>
            </div>
          )}

          {parsedNf.recipientCnpj === null && (
            <div className="text-gray-500 text-xs bg-gray-50 border border-gray-200 rounded p-2">
              ℹ️ CNPJ do destinatário não localizado — proteção de destinatário indisponível.
            </div>
          )}

          {!parsedNf.accessKey && (
            <div className="text-gray-500 text-xs bg-gray-50 border border-gray-200 rounded p-2">
              ℹ️ Chave de acesso NF-e não encontrada — proteção contra importação duplicada indisponível.
            </div>
          )}

          {parsedNf.validationError && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <FiAlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
              <span>{parsedNf.validationError}</span>
            </div>
          )}

          {/* Contador de pendentes */}
          <p className="text-sm text-gray-600">
            <strong>{items.length}</strong> itens encontrados.
            {pendingCount > 0
              ? <span className="ml-2 text-amber-700 font-medium">{pendingCount} ainda sem decisão.</span>
              : <span className="ml-2 text-green-700 font-medium">Todos os itens com decisão. ✓</span>}
          </p>

          {/* Tabela */}
          <div className="overflow-auto max-h-[400px] border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2 font-medium text-gray-700 w-2/5">Código / Descrição</th>
                  <th className="text-right p-2 font-medium text-gray-700">Qtd</th>
                  <th className="text-right p-2 font-medium text-gray-700">Custo Unit.</th>
                  <th className="text-right p-2 font-medium text-gray-700">Total</th>
                  <th className="text-left p-2 font-medium text-gray-700 w-2/5">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const d = getDecision(item.code);
                  const isPending = d.action === 'pending';
                  return (
                    <tr key={item.code} className={`border-t border-gray-100 ${isPending ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      <td className="p-2">
                        <div className="font-mono text-xs text-gray-400">{item.code}</div>
                        <div className="text-gray-900 text-xs leading-tight line-clamp-2">{item.description}</div>
                        <div className="text-xs text-gray-400 mt-0.5">NCM {item.ncm} · {item.unit}</div>
                      </td>
                      <td className="p-2 text-right font-medium">{item.quantity}</td>
                      <td className="p-2 text-right text-gray-700">{fmt(item.unitCost)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(item.totalCost)}</td>
                      <td className="p-2">
                        <select
                          value={getSelectValue(item.code)}
                          onChange={e => handleSelect(item.code, item.description, e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white ${isPending ? 'border-amber-400' : 'border-gray-300'}`}
                        >
                          <option value="">— Pendente —</option>
                          <option value="__IGNORE__">Ignorar este item</option>
                          <option value="__NEW__">⊕ Cadastrar como novo produto</option>
                          <option disabled>──────────</option>
                          {allProducts.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.sku ? ` (${p.sku})` : ''}
                            </option>
                          ))}
                        </select>
                        {d.action === 'new' && (
                          <input
                            type="text"
                            value={d.newProductName}
                            onChange={e => setNewProductName(item.code, e.target.value)}
                            placeholder="Nome do produto"
                            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 underline">
              ← Voltar
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => confirmMutation.mutate()}
                loading={confirmMutation.isPending}
                disabled={!allDecided || (!!parsedNf.duplicateImport && !reimport)}
              >
                {!allDecided
                  ? `${pendingCount} item(s) sem decisão`
                  : confirmMutation.isPending ? 'Importando...' : 'Confirmar importação'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Passo 3: Resultado ── */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 text-green-800">
            <FiCheck size={28} className="flex-shrink-0" />
            <div>
              <div className="font-semibold text-base">Importação concluída!</div>
              <div className="text-sm">
                {result.updatedProducts.length} produto(s) atualizado(s)
                {result.newProducts.length > 0 && ` · ${result.newProducts.length} criado(s)`}
                {result.skippedCount > 0 && ` · ${result.skippedCount} ignorado(s)`}
              </div>
            </div>
          </div>

          {result.updatedProducts.length > 0 && (
            <>
              <p className="text-sm font-medium text-gray-700">Produtos atualizados:</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-medium text-gray-700">Produto</th>
                      <th className="text-right p-2 font-medium text-gray-700">Adicionado</th>
                      <th className="text-right p-2 font-medium text-gray-700">Novo estoque</th>
                      <th className="text-right p-2 font-medium text-gray-700">Custo unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.updatedProducts.map(p => (
                      <tr key={p.productId} className="border-t border-gray-100">
                        <td className="p-2">{p.productName}</td>
                        <td className="p-2 text-right text-green-700 font-medium">+{p.addedQty}</td>
                        <td className="p-2 text-right font-semibold">{p.newQty}</td>
                        <td className="p-2 text-right text-gray-600">{fmt(p.newCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.newProducts.length > 0 && (
            <>
              <p className="text-sm font-medium text-gray-700">
                Produtos criados{' '}
                <span className="font-normal text-gray-500">(precisam de categoria e preço):</span>
              </p>
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="text-left p-2 font-medium text-amber-800">SKU</th>
                      <th className="text-left p-2 font-medium text-amber-800">Nome</th>
                      <th className="text-right p-2 font-medium text-amber-800">Estoque inicial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.newProducts.map(p => (
                      <tr key={p.productId} className="border-t border-amber-100">
                        <td className="p-2 font-mono text-xs">{p.sku}</td>
                        <td className="p-2">{p.productName}</td>
                        <td className="p-2 text-right font-semibold">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="primary" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
