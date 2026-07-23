import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Modal, Button } from '../../components/ui';
import { FiUpload, FiAlertTriangle, FiCheck } from 'react-icons/fi';

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
  supplierName: string | null;
  nfDate: string | null;
  totalProducts: number | null;
  validationError: string | null;
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
  updatedProducts: Array<{
    productId: string;
    productName: string;
    addedQty: number;
    newQty: number;
    newCost: number;
  }>;
  skippedCount: number;
}

interface NfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const NfImportModal: React.FC<NfImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedNf, setParsedNf] = useState<ParsedNf | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setFile(null);
      setParsedNf(null);
      setMappings({});
      setResult(null);
    }
  }, [isOpen]);

  const { data: allProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ['products-nf-import-options'],
    queryFn: async () => {
      const res = await api.get<PaginatedProducts>('/products', { params: { limit: 500 } });
      return res.data.data ?? [];
    },
    enabled: isOpen && step === 2,
    staleTime: 5 * 60 * 1000,
  });

  const parseMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append('nf', f);
      const res = await api.post<ParsedNf>('/nf-import/parse', form);
      return res.data;
    },
    onSuccess: (data) => {
      setParsedNf(data);
      const initial: Record<string, string> = {};
      for (const item of data.itemsWithSuggestions) {
        if (item.suggestedProductId) initial[item.code] = item.suggestedProductId;
      }
      setMappings(initial);
      setStep(2);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Erro ao processar PDF da nota fiscal.');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!parsedNf) throw new Error('Sem dados de NF');
      const items = parsedNf.itemsWithSuggestions.map(item => ({
        supplierCode: item.code,
        supplierDescription: item.description,
        ncm: item.ncm,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
        productId: mappings[item.code] || null,
      }));
      const res = await api.post<ConfirmResult>('/nf-import/confirm', {
        filename: file?.name ?? 'nota.pdf',
        nfNumber: parsedNf.nfNumber,
        supplierName: parsedNf.supplierName,
        nfDate: parsedNf.nfDate,
        totalProducts: parsedNf.totalProducts,
        items,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
      onSuccess();
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Erro ao confirmar importação.');
    },
  });

  const handleClose = () => {
    onClose();
  };

  const mappedCount = parsedNf
    ? parsedNf.itemsWithSuggestions.filter(i => !!mappings[i.code]).length
    : 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Importar Nota Fiscal — Passo ${step}/3`} size="xl">
      {/* Passo 1: Upload */}
      {step === 1 && (
        <div className="space-y-5">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-primary transition-colors">
            <FiUpload className="text-gray-400" size={40} />
            <span className="text-gray-600 text-sm">Clique para selecionar o PDF da DANFE (NF-e)</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded px-3 py-2">
              📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
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

      {/* Passo 2: Mapeamento */}
      {step === 2 && parsedNf && (
        <div className="space-y-4">
          {/* Metadados da NF */}
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {parsedNf.nfNumber && (
              <div><span className="text-gray-500">NF nº </span><strong>{parsedNf.nfNumber}</strong></div>
            )}
            {parsedNf.supplierName && (
              <div className="truncate"><span className="text-gray-500">Fornecedor: </span><strong>{parsedNf.supplierName}</strong></div>
            )}
            {parsedNf.nfDate && (
              <div>
                <span className="text-gray-500">Emissão: </span>
                <strong>{new Date(parsedNf.nfDate + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
              </div>
            )}
            {parsedNf.totalProducts !== null && (
              <div><span className="text-gray-500">Total produtos: </span><strong>{fmt(parsedNf.totalProducts)}</strong></div>
            )}
          </div>

          {parsedNf.validationError && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <FiAlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
              <span>{parsedNf.validationError}</span>
            </div>
          )}

          <p className="text-sm text-gray-600">
            <strong>{parsedNf.itemsWithSuggestions.length}</strong> itens encontrados.
            Mapeie cada um para um produto do catálogo ou deixe em "Ignorar".
            {mappedCount > 0 && (
              <span className="ml-2 text-green-700 font-medium">{mappedCount} mapeado(s).</span>
            )}
          </p>

          <div className="overflow-auto max-h-[420px] border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2 font-medium text-gray-700 w-2/5">Código / Descrição</th>
                  <th className="text-right p-2 font-medium text-gray-700">Qtd</th>
                  <th className="text-right p-2 font-medium text-gray-700">Custo Unit.</th>
                  <th className="text-right p-2 font-medium text-gray-700">Total</th>
                  <th className="text-left p-2 font-medium text-gray-700 w-2/5">Produto Catálogo</th>
                </tr>
              </thead>
              <tbody>
                {parsedNf.itemsWithSuggestions.map(item => (
                  <tr key={item.code} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-2">
                      <div className="font-mono text-xs text-gray-400">{item.code}</div>
                      <div className="text-gray-900 text-xs leading-tight line-clamp-2">{item.description}</div>
                      <div className="text-xs text-gray-400 mt-0.5">NCM {item.ncm} · {item.unit}</div>
                    </td>
                    <td className="p-2 text-right font-medium text-gray-900">{item.quantity}</td>
                    <td className="p-2 text-right text-gray-700">{fmt(item.unitCost)}</td>
                    <td className="p-2 text-right font-semibold text-gray-900">{fmt(item.totalCost)}</td>
                    <td className="p-2">
                      <select
                        value={mappings[item.code] ?? ''}
                        onChange={(e) =>
                          setMappings(prev => ({ ...prev, [item.code]: e.target.value }))
                        }
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">— Ignorar —</option>
                        {allProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.sku ? ` (${p.sku})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              ← Voltar
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => confirmMutation.mutate()}
                loading={confirmMutation.isPending}
                disabled={mappedCount === 0}
              >
                {confirmMutation.isPending ? 'Importando...' : `Confirmar (${mappedCount} produto${mappedCount !== 1 ? 's' : ''})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Passo 3: Resultado */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 text-green-800">
            <FiCheck size={28} className="flex-shrink-0" />
            <div>
              <div className="font-semibold text-base">Importação concluída!</div>
              <div className="text-sm">
                {result.updatedProducts.length} produto(s) atualizado(s)
                {result.skippedCount > 0 && ` · ${result.skippedCount} ignorado(s)`}
              </div>
            </div>
          </div>

          {result.updatedProducts.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-700">Produto</th>
                    <th className="text-right p-2 font-medium text-gray-700">Qtd adicionada</th>
                    <th className="text-right p-2 font-medium text-gray-700">Novo estoque</th>
                    <th className="text-right p-2 font-medium text-gray-700">Custo unit.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.updatedProducts.map(p => (
                    <tr key={p.productId} className="border-t border-gray-100">
                      <td className="p-2 text-gray-900">{p.productName}</td>
                      <td className="p-2 text-right font-medium text-green-700">+{p.addedQty}</td>
                      <td className="p-2 text-right font-semibold">{p.newQty}</td>
                      <td className="p-2 text-right text-gray-600">{fmt(p.newCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="primary" onClick={handleClose}>Fechar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
