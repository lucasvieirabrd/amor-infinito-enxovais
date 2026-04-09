import React from 'react';
import {
  FiTrendingUp, FiAlertTriangle, FiCheckCircle,
  FiDollarSign, FiUsers, FiPackage,
} from 'react-icons/fi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { Card } from '../../components/ui';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

// ── tipos ────────────────────────────────────────────────
interface InstallmentStats {
  overdue:           { count: number; total: number };
  pendingToday:      { count: number; total: number };
  inDay:             { count: number; total: number };
  totalReceivable:   { count: number; total: number };
  receivedThisMonth: { total: number };
  totalCustomers:    number;
}

interface PaymentPoint {
  day: string;
  total: number;
}

interface TopProduct {
  name: string;
  sku: string;
  totalQty: number;
  totalRevenue: number;
}

// ── fetchers ─────────────────────────────────────────────
const fetchTotalSales = async (): Promise<number> => {
  const { data } = await api.get<{ totalSales: number }>('/sales/total-sales');
  return Number(data.totalSales) || 0;
};

const fetchInstallmentStats = async (): Promise<InstallmentStats> => {
  const { data } = await api.get<InstallmentStats>('/installments/stats');
  return data;
};

const fetchPaymentsLast30Days = async (): Promise<PaymentPoint[]> => {
  const { data } = await api.get<{ payments: PaymentPoint[] }>('/installments/payments-last-30-days');
  return data.payments.map(p => ({ ...p, total: Number(p.total) || 0 }));
};

const fetchTopProducts = async (): Promise<TopProduct[]> => {
  const { data } = await api.get<{ topProducts: TopProduct[] }>('/sales/top-products');
  return data.topProducts;
};

// ── helpers ──────────────────────────────────────────────
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── componente ───────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const today = format(new Date(), 'dd/MM/yyyy');

  const { data: totalSales = 0, isLoading: l1 } =
    useQuery<number, Error>({ queryKey: ['totalSales'], queryFn: fetchTotalSales });

  const { data: stats, isLoading: l2 } =
    useQuery<InstallmentStats, Error>({ queryKey: ['installmentStats'], queryFn: fetchInstallmentStats });

  const { data: payments = [], isLoading: l3 } =
    useQuery<PaymentPoint[], Error>({ queryKey: ['paymentsLast30Days'], queryFn: fetchPaymentsLast30Days });

  const { data: topProducts = [], isLoading: l4 } =
    useQuery<TopProduct[], Error>({ queryKey: ['topProducts'], queryFn: fetchTopProducts });

  if (l1 || l2 || l3 || l4) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Carregando dashboard…
      </div>
    );
  }

  // ── dados para os gráficos ──────────────────────────────
  const paymentsChartData = payments.map(p => ({
    name: format(parseISO(String(p.day)), 'dd/MM'),
    value: p.total,
  }));

  const installmentChartData = [
    { name: 'Em Dia',   value: stats?.inDay?.count ?? 0,   fill: '#48BB78' },
    { name: 'Atrasado', value: stats?.overdue?.count ?? 0, fill: '#FC8181' },
  ];

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-primary to-secondary rounded-card shadow-card p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Bem-vindo ao Amor Infinito!</h1>
        <p className="text-white text-opacity-90">Hoje é {today}. Aqui está um resumo do seu negócio.</p>
      </div>

      {/* KPI Cards — 5 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Vendas do Mês */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary bg-opacity-10 text-primary rounded-lg shrink-0">
              <FiTrendingUp size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-snug">💰 Total Vendas do Mês</p>
              <p className="text-xl font-bold text-gray-900 mt-1 truncate">{brl(totalSales)}</p>
            </div>
          </div>
        </Card>

        {/* Total a Receber */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-lg shrink-0">
              <FiDollarSign size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-snug">📥 Total a Receber</p>
              <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                {brl(stats?.totalReceivable?.total ?? 0)}
              </p>
              <p className="text-xs text-gray-400">
                {stats?.totalReceivable?.count ?? 0} parcelas
              </p>
            </div>
          </div>
        </Card>

        {/* Em Atraso */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-50 text-red-500 rounded-lg shrink-0">
              <FiAlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-snug">⚠️ Em Atraso</p>
              <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                {brl(stats?.overdue?.total ?? 0)}
              </p>
              <p className="text-xs text-red-400 font-medium">
                {stats?.overdue?.count ?? 0} parcelas vencidas
              </p>
            </div>
          </div>
        </Card>

        {/* Recebido no Mês */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-50 text-green-500 rounded-lg shrink-0">
              <FiCheckCircle size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-snug">✅ Recebido no Mês</p>
              <p className="text-xl font-bold text-gray-900 mt-1 truncate">
                {brl(stats?.receivedThisMonth?.total ?? 0)}
              </p>
            </div>
          </div>
        </Card>

        {/* Total de Clientes */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-50 text-purple-500 rounded-lg shrink-0">
              <FiUsers size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium leading-snug">👥 Total de Clientes</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {stats?.totalCustomers ?? 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recebimentos Últimos 30 Dias */}
        <Card title="Recebimentos dos Últimos 30 Dias" subtitle="Parcelas pagas por dia">
          <div className="h-64">
            {paymentsChartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Nenhum recebimento nos últimos 30 dias
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paymentsChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                  <YAxis
                    hide
                    tickFormatter={(v: number) => brl(v)}
                  />
                  <Tooltip
                    formatter={(v: number) => [brl(v), 'Recebido']}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#48BB78"
                    strokeWidth={3}
                    dot={{ r: 3, fill: '#48BB78' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Status do Crediário */}
        <Card title="Status do Crediário" subtitle="Distribuição de parcelas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={installmentChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={70} />
                <Tooltip
                  formatter={(v: number) => [v, 'Parcelas']}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {installmentChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top 5 Produtos do Mês */}
      <Card title="Produtos Mais Vendidos no Mês" subtitle="Top 5 por quantidade (vendas reais)">
        {topProducts.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            Nenhuma venda registrada este mês
          </p>
        ) : (
          <div className="space-y-3">
            {topProducts.map((product, index) => {
              const maxQty = topProducts[0]?.totalQty || 1;
              const pct = Math.round((product.totalQty / maxQty) * 100);
              const medals = ['🥇', '🥈', '🥉', '4°', '5°'];
              return (
                <div key={product.sku || index} className="flex items-center gap-4">
                  <span className="text-lg w-7 text-center shrink-0">{medals[index]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate">{product.name}</span>
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
    </div>
  );
};
