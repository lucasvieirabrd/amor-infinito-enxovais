import React, { useState } from 'react';
import {
  FiTrendingUp, FiAlertTriangle, FiCheckCircle,
  FiDollarSign, FiUsers, FiCreditCard, FiShoppingCart,
} from 'react-icons/fi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Card } from '../../components/ui';
import {
  format, parseISO, startOfMonth, endOfMonth,
  startOfWeek, startOfYear, subDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import api from '../../services/api';

// ── Types ─────────────────────────────────────────────────
type Preset    = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';
type CompareTo = 'none' | 'previous' | 'year_ago';

interface SalesSegment { total: number; count: number; }

interface SalesData {
  total: number;
  cash: SalesSegment;
  creditCard: SalesSegment;
  installment: SalesSegment;
  totalCustomers: number;
}

interface SalesMetrics {
  period: { start: string; end: string };
  sales: SalesData;
  comparison?: SalesData;
  billing: {
    totalReceivable: SalesSegment;
    overdue: SalesSegment;
    receivedThisMonth: { total: number };
  };
  salesByDay: Array<{ day: string; total: number }>;
  topProducts: Array<{ name: string; sku: string; totalQty: number; totalRevenue: number }>;
}

// ── Helpers ───────────────────────────────────────────────
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateFmt = (d: Date) => format(d, 'yyyy-MM-dd');

const getPresetDates = (p: Preset): { start: string; end: string } => {
  const now = new Date();
  switch (p) {
    case 'today':
      return { start: dateFmt(now), end: dateFmt(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: dateFmt(y), end: dateFmt(y) };
    }
    case 'week':
      return { start: dateFmt(startOfWeek(now, { weekStartsOn: 1 })), end: dateFmt(now) };
    case 'month':
      return { start: dateFmt(startOfMonth(now)), end: dateFmt(endOfMonth(now)) };
    case 'year':
      return { start: dateFmt(startOfYear(now)), end: dateFmt(now) };
    default:
      return { start: dateFmt(startOfMonth(now)), end: dateFmt(endOfMonth(now)) };
  }
};

const calcVar = (current: number, previous?: number): number | null => {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const VarBadge: React.FC<{ current: number; previous?: number }> = ({ current, previous }) => {
  const v = calcVar(current, previous);
  if (v === null) return null;
  return (
    <span className={`text-xs font-bold ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
      {v >= 0 ? '↑' : '↓'} {Math.abs(v).toFixed(1)}%
    </span>
  );
};

// ── Component ─────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const [preset, setPreset]     = useState<Preset>('month');
  const [period, setPeriod]     = useState(() => getPresetDates('month'));
  const [compareTo, setCompareTo] = useState<CompareTo>('none');

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setPeriod(getPresetDates(p));
  };

  const { data: metrics, isLoading, isFetching } = useQuery<SalesMetrics>({
    queryKey: ['salesMetrics', period.start, period.end, compareTo],
    queryFn:  () =>
      api.get('/dashboard/sales-metrics', {
        params: { start: period.start, end: period.end, compareTo },
      }).then(r => r.data),
    placeholderData: keepPreviousData,
  });

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today',     label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: 'week',      label: 'Esta semana' },
    { key: 'month',     label: 'Este mês' },
    { key: 'year',      label: 'Este ano' },
  ];

  const sales      = metrics?.sales;
  const comparison = metrics?.comparison;
  const billing    = metrics?.billing;

  const salesByDayData = (metrics?.salesByDay ?? []).map(p => ({
    name:  format(parseISO(p.day), 'dd/MM'),
    value: p.total,
  }));

  const paymentMethodData = [
    { name: 'À Vista',   value: sales?.cash.total        ?? 0, count: sales?.cash.count        ?? 0, fill: '#48BB78' },
    { name: 'Cartão',    value: sales?.creditCard.total   ?? 0, count: sales?.creditCard.count   ?? 0, fill: '#4299E1' },
    { name: 'Crediário', value: sales?.installment.total  ?? 0, count: sales?.installment.count  ?? 0, fill: '#9F7AEA' },
  ].filter(d => d.value > 0);

  const topProducts = metrics?.topProducts ?? [];

  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">

      {/* ── Banner ── */}
      <div className="bg-gradient-to-r from-primary to-secondary rounded-card shadow-card p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Bem-vindo ao Amor Infinito!</h1>
        <p className="text-white text-opacity-90">Hoje é {today}. Aqui está um resumo do seu negócio.</p>
      </div>

      {/* ── Filtro de Período ── */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  preset === key
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">De</label>
              <input
                type="date"
                value={period.start}
                onChange={e => {
                  setPreset('custom');
                  setPeriod(prev => ({ ...prev, start: e.target.value }));
                }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">até</label>
              <input
                type="date"
                value={period.end}
                onChange={e => {
                  setPreset('custom');
                  setPeriod(prev => ({ ...prev, end: e.target.value }));
                }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm text-gray-500 shrink-0">Comparar com</label>
              <select
                value={compareTo}
                onChange={e => setCompareTo(e.target.value as CompareTo)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="none">Não comparar</option>
                <option value="previous">Período anterior</option>
                <option value="year_ago">Mesmo período ano passado</option>
              </select>
            </div>
          </div>

          {isFetching && !isLoading && (
            <p className="text-xs text-gray-400 animate-pulse">Atualizando...</p>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Carregando dashboard…
        </div>
      ) : (
        <>
          {/* ── Linha 1: Cards de Vendas ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary bg-opacity-10 text-primary rounded-lg shrink-0">
                  <FiTrendingUp size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Total Vendido</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">{brl(sales?.total ?? 0)}</p>
                  <VarBadge current={sales?.total ?? 0} previous={comparison?.total} />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-50 text-green-500 rounded-lg shrink-0">
                  <FiDollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">À Vista</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">{brl(sales?.cash.total ?? 0)}</p>
                  <p className="text-xs text-gray-400">{sales?.cash.count ?? 0} vendas</p>
                  <VarBadge current={sales?.cash.total ?? 0} previous={comparison?.cash.total} />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg shrink-0">
                  <FiCreditCard size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Cartão</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">{brl(sales?.creditCard.total ?? 0)}</p>
                  <p className="text-xs text-gray-400">{sales?.creditCard.count ?? 0} vendas</p>
                  <VarBadge current={sales?.creditCard.total ?? 0} previous={comparison?.creditCard.total} />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg shrink-0">
                  <FiShoppingCart size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Crediário</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">{brl(sales?.installment.total ?? 0)}</p>
                  <p className="text-xs text-gray-400">{sales?.installment.count ?? 0} vendas</p>
                  <VarBadge current={sales?.installment.total ?? 0} previous={comparison?.installment.total} />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg shrink-0">
                  <FiUsers size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Total de Clientes</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{sales?.totalCustomers ?? 0}</p>
                </div>
              </div>
            </Card>

          </div>

          {/* ── Linha 2: Cards de Cobrança ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg shrink-0">
                  <FiDollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">📥 Total a Receber</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                    {brl(billing?.totalReceivable.total ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400">{billing?.totalReceivable.count ?? 0} parcelas</p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-50 text-red-500 rounded-lg shrink-0">
                  <FiAlertTriangle size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">⚠️ Em Atraso</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                    {brl(billing?.overdue.total ?? 0)}
                  </p>
                  <p className="text-xs text-red-400 font-medium">
                    {billing?.overdue.count ?? 0} parcelas vencidas
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-50 text-green-500 rounded-lg shrink-0">
                  <FiCheckCircle size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">✅ Recebido no Mês</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                    {brl(billing?.receivedThisMonth.total ?? 0)}
                  </p>
                </div>
              </div>
            </Card>

          </div>

          {/* ── Gráficos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Vendas por Dia */}
            <Card title="Vendas por Dia" subtitle="Total vendido por dia no período">
              <div className="h-64">
                {salesByDayData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Nenhuma venda no período
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesByDayData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v: number) => [brl(v), 'Vendido']}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#7C3AED"
                        strokeWidth={3}
                        dot={{ r: 3, fill: '#7C3AED' }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Vendas por Forma de Pagamento */}
            <Card title="Vendas por Forma de Pagamento" subtitle="Distribuição no período">
              <div className="h-64">
                {paymentMethodData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Nenhuma venda no período
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={paymentMethodData}
                            dataKey="value"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={82}
                            paddingAngle={2}
                          >
                            {paymentMethodData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: number) => [brl(v)]}
                            contentStyle={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 pb-1">
                      {paymentMethodData.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-xs text-gray-600">{item.name}</span>
                          <span className="text-xs text-gray-400">({item.count} vendas)</span>
                          <span className="text-xs font-semibold text-gray-900 ml-auto">
                            {brl(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

          </div>

          {/* ── Produtos Mais Vendidos no Mês ── */}
          <Card title="Produtos Mais Vendidos no Mês" subtitle="Top 5 por quantidade (vendas reais)">
            {topProducts.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                Nenhuma venda registrada no período
              </p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => {
                  const maxQty = topProducts[0]?.totalQty || 1;
                  const pct    = Math.round((product.totalQty / maxQty) * 100);
                  const medals = ['🥇', '🥈', '🥉', '4°', '5°'];
                  return (
                    <div key={product.sku || index} className="flex items-center gap-4">
                      <span className="text-lg w-7 text-center shrink-0">{medals[index]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {product.name}
                          </span>
                          <span className="text-sm font-bold text-gray-900 ml-2 shrink-0">
                            {product.totalQty} un.
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{brl(product.totalRevenue)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
