import React, { useState, useCallback } from 'react';
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

function newItem(): ItemInput {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    unitCost: '',
    assembly: '0',
    installmentsCount: '10',
    cardInstallmentsCount: '12',
    impostoOverride: '',
  };
}

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
      setUnlocked(true);
    } catch (err: any) {
      setUnlockError(err?.response?.data?.error ?? 'Código inválido');
    } finally {
      setUnlocking(false);
    }
  };

  const handleCalculate = async () => {
    const validItems = items.filter(i => i.name.trim() && i.unitCost);
    if (!validItems.length) return;
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
        items: validItems.map(i => ({
          name: i.name.trim(),
          unitCost: parseFloat(i.unitCost),
          assembly: parseFloat(i.assembly) || 0,
          installmentsCount: parseInt(i.installmentsCount) || 10,
          imposto: i.impostoOverride ? parseFloat(i.impostoOverride) / 100 : undefined,
        })),
      });
      const enriched: ItemResult[] = res.data.results.map((r: any, i: number) => {
        const cardN = parseInt(validItems[i]?.cardInstallmentsCount) || 12;
        return { ...r, cardInstallmentsCount: cardN, installmentValueCard: r.priceCard10x / cardN };
      });
      setResults(enriched);
      setFactor(res.data.factor);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Erro ao calcular');
    } finally {
      setCalculating(false);
    }
  };

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
        items: validItems.map(i => ({
          name: i.name.trim(),
          unitCost: parseFloat(i.unitCost),
          assembly: parseFloat(i.assembly) || 0,
          installmentsCount: parseInt(i.installmentsCount) || 10,
          imposto: i.impostoOverride ? parseFloat(i.impostoOverride) / 100 : undefined,
        })),
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
    setResults(null);
  }, []);

  const addItem = () => setItems(prev => [...prev, newItem()]);
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
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
                  onChange={e => { setter(e.target.value); setResults(null); }}
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
                onChange={e => { setFreight(e.target.value); setResults(null); }}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
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
            {/* Header row */}
            <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-3">Nome do produto</div>
              <div className="col-span-2">Custo unit. (R$)</div>
              <div className="col-span-2">Montagem (R$)</div>
              <div className="col-span-1">Cred. ×</div>
              <div className="col-span-1">Cart. ×</div>
              <div className="col-span-2">Imposto % (opt.)</div>
              <div className="col-span-1"></div>
            </div>

            {items.map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 md:col-span-3">
                  <input
                    type="text"
                    value={item.name}
                    onChange={e => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Nome"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <input
                    type="number"
                    value={item.unitCost}
                    onChange={e => updateItem(item.id, 'unitCost', e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <input
                    type="number"
                    value={item.assembly}
                    onChange={e => updateItem(item.id, 'assembly', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <input
                    type="number"
                    value={item.installmentsCount}
                    onChange={e => updateItem(item.id, 'installmentsCount', e.target.value)}
                    min={1}
                    max={60}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <input
                    type="number"
                    value={item.cardInstallmentsCount}
                    onChange={e => updateItem(item.id, 'cardInstallmentsCount', e.target.value)}
                    min={2}
                    max={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-5 md:col-span-2">
                  <input
                    type="number"
                    value={item.impostoOverride}
                    onChange={e => updateItem(item.id, 'impostoOverride', e.target.value)}
                    placeholder={params ? (params.imposto * 100).toFixed(1) : '8.3'}
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleCalculate}
              disabled={calculating}
              className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {calculating ? 'Calculando...' : 'Calcular Preços'}
            </button>
          </div>
        </div>

        {/* Results */}
        {results && results.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-800">Resultados</h2>
              <div className="flex gap-2">
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
