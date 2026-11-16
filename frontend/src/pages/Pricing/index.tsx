import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

const API = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api',
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricingParams {
  imposto: number;
  comissao_vendedores_crediario: number;
  comissao_marcelo_celita_crediario: number;
  comissao_vendedores_avista: number;
  comissao_marcelo_celita_avista: number;
  custos_fixos: number;
  calote: number;
  multiplicador_crediario: number;
  lucro_desejado_avista_cartao: number;
  taxa_cartao_1x: number;
  taxa_cartao_parcelado: number;
  mostrar_lucro_para_marcelo: boolean;
}

interface ItemInput {
  id: string;
  name: string;
  unitCost: string;
  assembly: string;
  installmentsCount: string;
  cardInstallmentsCount: string;
  impostoOverride: string;
  multiplicador: string;
}

interface ItemResult {
  name: string;
  unitCost: number;
  assembly: number;
  installmentsCount: number;
  realCost: number;
  priceCredit: number;
  installmentValue: number;
  profitCredit: number;
  profitCreditPct: number;
  priceCash: number;
  profitCash: number;
  profitCashPct: number;
  priceCard1x: number;
  priceCard10x: number;
  discountPct: number;
  divisorValid: boolean;
  cardInstallmentsCount: number;
  installmentValueCard: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%';
}

/** Formata o multiplicador com vírgula (ex.: 3.03 → "3,03"). */
function fmtMult(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

/** Lê o multiplicador aceitando vírgula ou ponto. Vazio/inválido → undefined (usa o padrão). */
function parseMult(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function newItem(defaultMult?: number): ItemInput {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    unitCost: '',
    assembly: '0',
    installmentsCount: '10',
    cardInstallmentsCount: '12',
    impostoOverride: '',
    multiplicador: fmtMult(defaultMult),
  };
}

function toItemPayload(i: ItemInput) {
  return {
    name: i.name.trim(),
    unitCost: parseFloat(i.unitCost),
    assembly: parseFloat(i.assembly) || 0,
    installmentsCount: parseInt(i.installmentsCount) || 10,
    imposto: i.impostoOverride ? parseFloat(i.impostoOverride) / 100 : undefined,
    multiplicador: parseMult(i.multiplicador),
  };
}

const inputCls =
  'w-full px-3 py-2.5 md:py-2 border border-gray-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';
const fieldLabelCls = 'block md:hidden text-xs font-medium text-gray-600 mb-1';
// Colunas da linha de produto no desktop (mesmo template no cabeçalho e nas linhas)
const ROW_GRID =
  'md:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_2rem]';

// ─── Component ────────────────────────────────────────────────────────────────

export const Pricing: React.FC = () => {
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [params, setParams] = useState<PricingParams | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const [supplier, setSupplier] = useState('');
  const [nfNumber, setNfNumber] = useState('');
  const [totalProducts, setTotalProducts] = useState('');
  const [totalNf, setTotalNf] = useState('');
  const [freight, setFreight] = useState('0');

  const [items, setItems] = useState<ItemInput[]>([newItem()]);
  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [factor, setFactor] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!code.trim()) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await API.post('/pricing/validate', { code: code.trim() });
      setParams(res.data.params);
      const defMult = res.data.params?.multiplicador_crediario;
      setItems(prev => prev.map(it => (it.multiplicador ? it : { ...it, multiplicador: fmtMult(defMult) })));
      setUnlocked(true);
    } catch (err: any) {
      setUnlockError(err?.response?.data?.error ?? 'Código inválido');
    } finally {
      setUnlocking(false);
    }
  };

  // Depois do primeiro "Calcular", qualquer mudança nos campos recalcula sozinha.
  const [liveCalc, setLiveCalc] = useState(false);
  const calcSeq = useRef(0);

  const handleCalculate = async (silent = false) => {
    const validItems = items.filter(i => i.name.trim() && i.unitCost);
    if (!validItems.length) {
      if (silent) setResults(null);
      return;
    }
    const seq = ++calcSeq.current;
    setCalculating(true);
    setSavedId(null);
    try {
      const res = await API.post('/pricing/calculate', {
        code: code.trim(),
        supplier: supplier || undefined,
        nfNumber: nfNumber || undefined,
        totalProducts: totalProducts ? parseFloat(totalProducts) : undefined,
        totalNf: totalNf ? parseFloat(totalNf) : undefined,
        freight: parseFloat(freight) || 0,
        items: validItems.map(toItemPayload),
      });
      if (seq !== calcSeq.current) return; // resposta antiga, ignora
      const enriched: ItemResult[] = res.data.results.map((r: any, i: number) => {
        const cardN = parseInt(validItems[i]?.cardInstallmentsCount) || 12;
        return { ...r, cardInstallmentsCount: cardN, installmentValueCard: r.priceCard10x / cardN };
      });
      setResults(enriched);
      setFactor(res.data.factor);
      setLiveCalc(true);
    } catch (err: any) {
      if (seq !== calcSeq.current) return;
      if (silent) setResults(null);
      else alert(err?.response?.data?.error ?? 'Erro ao calcular');
    } finally {
      if (seq === calcSeq.current) setCalculating(false);
    }
  };

  useEffect(() => {
    if (!liveCalc) return;
    const t = setTimeout(() => { handleCalculate(true); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, supplier, nfNumber, totalProducts, totalNf, freight]);

  const handleSave = async () => {
    if (!results) return;
    const validItems = items.filter(i => i.name.trim() && i.unitCost);
    setSaving(true);
    try {
      const res = await API.post('/pricing/history', {
        code: code.trim(),
        supplier: supplier || undefined,
        nfNumber: nfNumber || undefined,
        totalProducts: totalProducts ? parseFloat(totalProducts) : undefined,
        totalNf: totalNf ? parseFloat(totalNf) : undefined,
        freight: parseFloat(freight) || 0,
        items: validItems.map(toItemPayload),
      });
      setSavedId(res.data.id);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const buildWhatsAppText = () => {
    if (!results) return '';
    const lines: string[] = ['*Tabela de Preços*', ''];
    results.forEach(r => {
      lines.push(`*${r.name}*`);
      if (r.installmentsCount >= 2) {
        lines.push(`  Crediário: ${fmtBRL(r.priceCredit)} (Entrada de ${fmtBRL(r.installmentValue)} + ${r.installmentsCount - 1}× de ${fmtBRL(r.installmentValue)})`);
      } else {
        lines.push(`  Crediário: ${fmtBRL(r.priceCredit)}`);
      }
      lines.push(`  À Vista: ${fmtBRL(r.priceCash)}`);
      lines.push(`  Cartão 1×: ${fmtBRL(r.priceCard1x)}`);
      lines.push(`  Cartão ${r.cardInstallmentsCount}×: ${fmtBRL(r.priceCard10x)} (${r.cardInstallmentsCount}× de ${fmtBRL(r.installmentValueCard)})`);
      lines.push('');
    });
    return lines.join('\n');
  };

  const handleCopyWhatsApp = () => {
    const text = buildWhatsAppText();
    navigator.clipboard.writeText(text).then(() => alert('Texto copiado!'));
  };

  const updateItem = useCallback((id: string, field: keyof ItemInput, value: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
    setSavedId(null);
  }, []);

  const addItem = () => setItems(prev => [...prev, newItem(params?.multiplicador_crediario)]);
  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Calculadora</h1>
          <p className="text-sm text-gray-500 mb-6">Amor Infinito Enxovais — Precificação</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de acesso</label>
              <input
                type="password"
                value={code}
                onChange={e => { setCode(e.target.value); setUnlockError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Digite o código"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {unlockError && <p className="mt-1 text-xs text-red-600">{unlockError}</p>}
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking}
              className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {unlocking ? 'Verificando...' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Calculadora de Precificação</h1>
          <p className="text-sm text-gray-500 mt-1">Amor Infinito Enxovais</p>
        </div>

        {/* NF Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Dados da Nota Fiscal (opcional)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Fornecedor', value: supplier, setter: setSupplier, type: 'text', placeholder: 'Ex.: Almofadões & Cia' },
              { label: 'N° NF', value: nfNumber, setter: setNfNumber, type: 'text', placeholder: 'Ex.: 004521' },
              { label: 'Total Produtos (R$)', value: totalProducts, setter: setTotalProducts, type: 'number', placeholder: '0,00' },
              { label: 'Total NF (R$)', value: totalNf, setter: setTotalNf, type: 'number', placeholder: '0,00' },
            ].map(({ label, value, setter, type, placeholder }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type={type}
                  value={value}
                  onChange={e => { setter(e.target.value); setSavedId(null); }}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frete (R$)</label>
              <input
                type="number"
                value={freight}
                onChange={e => { setFreight(e.target.value); setSavedId(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          {factor !== null && (
            <p className="mt-3 text-xs text-gray-500">
              Fator calculado: <span className="font-semibold text-gray-700">{factor.toFixed(4)}</span>
              {' '}(custo unitário × fator = custo real)
            </p>
          )}
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Produtos</h2>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              + Adicionar produto
            </button>
          </div>

          <div className="space-y-3">
            {/* Cabeçalho de colunas — só no desktop; no celular cada campo tem seu próprio rótulo */}
            <div className={`hidden md:grid ${ROW_GRID} gap-2 text-xs font-medium text-gray-500 px-1`}>
              <div>Nome do produto</div>
              <div>Custo unit. (R$)</div>
              <div>Montagem (R$)</div>
              <div>Cred. ×</div>
              <div>Cart. ×</div>
              <div>Multiplicador</div>
              <div>Imposto % (opt.)</div>
              <div></div>
            </div>

            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`border border-gray-200 rounded-xl p-3 md:border-0 md:rounded-none md:p-0 grid grid-cols-2 ${ROW_GRID} gap-3 md:gap-2 md:items-center`}
              >
                {/* Topo do cartão (só celular) */}
                <div className="col-span-2 flex items-center justify-between md:hidden">
                  <span className="text-sm font-semibold text-gray-700">Produto {idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded-lg active:bg-red-100"
                    >
                      Remover
                    </button>
                  )}
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className={fieldLabelCls}>Nome do produto</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={e => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Nome"
                    aria-label="Nome do produto"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Custo unit. (R$)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.unitCost}
                    onChange={e => updateItem(item.id, 'unitCost', e.target.value)}
                    placeholder="0,00"
                    aria-label="Custo unitário (R$)"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Montagem (R$)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.assembly}
                    onChange={e => updateItem(item.id, 'assembly', e.target.value)}
                    placeholder="0"
                    aria-label="Montagem (R$)"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Parcelas crediário (×)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={item.installmentsCount}
                    onChange={e => updateItem(item.id, 'installmentsCount', e.target.value)}
                    min={1}
                    max={60}
                    aria-label="Parcelas no crediário"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Parcelas cartão (×)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={item.cardInstallmentsCount}
                    onChange={e => updateItem(item.id, 'cardInstallmentsCount', e.target.value)}
                    min={2}
                    max={12}
                    aria-label="Parcelas no cartão"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Multiplicador</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.multiplicador}
                    onChange={e => updateItem(item.id, 'multiplicador', e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder={params ? fmtMult(params.multiplicador_crediario) : '3'}
                    aria-label="Multiplicador do crediário"
                    title="Multiplicador do crediário só para este produto (não altera as Configurações). Vazio = padrão."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Imposto % (opcional)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.impostoOverride}
                    onChange={e => updateItem(item.id, 'impostoOverride', e.target.value)}
                    placeholder={params ? (params.imposto * 100).toFixed(1) : '8.3'}
                    step="0.1"
                    aria-label="Imposto % (opcional)"
                    className={inputCls}
                  />
                </div>
                <div className="hidden md:flex justify-center">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remover produto"
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col md:flex-row gap-3">
            <button
              type="button"
              onClick={() => handleCalculate()}
              disabled={calculating}
              className="w-full md:w-auto px-6 py-3 md:py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {calculating ? 'Calculando...' : 'Calcular Preços'}
            </button>
            {liveCalc && (
              <span className="text-xs text-gray-500 self-center">Os preços se atualizam sozinhos ao mudar os campos.</span>
            )}
          </div>
        </div>

        {/* Results */}
        {results && results.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-base font-semibold text-gray-800">Resultados</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="px-3 py-1.5 text-sm font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                >
                  📋 Copiar para WhatsApp
                </button>
                {!savedId ? (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-60 transition-colors"
                  >
                    {saving ? 'Salvando...' : '💾 Salvar no histórico'}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 text-sm text-green-700 bg-green-50 rounded-lg">✓ Salvo!</span>
                )}
              </div>
            </div>

            <div className="space-y-5">
              {results.map((r, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{r.name}</h3>
                    <span className="text-xs text-gray-500">Custo real: {fmtBRL(r.realCost)}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-indigo-50 rounded-lg p-3">
                      <div className="text-xs text-indigo-600 font-medium mb-1">Crediário ({r.installmentsCount}×)</div>
                      <div className="text-lg font-bold text-indigo-700">{fmtBRL(r.priceCredit)}</div>
                      <div className="text-xs text-indigo-500">
                        {r.installmentsCount >= 2
                          ? `Entrada de ${fmtBRL(r.installmentValue)} + ${r.installmentsCount - 1}× de ${fmtBRL(r.installmentValue)}`
                          : fmtBRL(r.installmentValue)
                        }
                      </div>
                      {params?.mostrar_lucro_para_marcelo && (
                        <div className="text-xs text-indigo-400 mt-1">Lucro: {fmtBRL(r.profitCredit)} ({pct(r.profitCreditPct)})</div>
                      )}
                    </div>

                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-green-600 font-medium mb-1">À Vista</div>
                      <div className="text-lg font-bold text-green-700">{fmtBRL(r.priceCash)}</div>
                      <div className="text-xs text-green-500">Desconto: {pct(r.discountPct)} do crediário</div>
                      {params?.mostrar_lucro_para_marcelo && (
                        <div className="text-xs text-green-400 mt-1">Lucro: {fmtBRL(r.profitCash)} ({pct(r.profitCashPct)})</div>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 font-medium mb-1">Cartão 1×</div>
                      <div className="text-lg font-bold text-gray-700">{fmtBRL(r.priceCard1x)}</div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 font-medium mb-1">Cartão {r.cardInstallmentsCount}×</div>
                      <div className="text-lg font-bold text-gray-700">{fmtBRL(r.priceCard10x)}</div>
                      <div className="text-xs text-gray-500">{r.cardInstallmentsCount}× de {fmtBRL(r.installmentValueCard)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
