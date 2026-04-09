import React from 'react';
import { 
  FiTrendingUp, FiAlertTriangle, FiCheckCircle, FiDollarSign, FiPackage 
} from 'react-icons/fi';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';
import { Card, Badge, Button } from '../../components/ui';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

interface SalesDataPoint {
  saleDate: string;
  totalSales: number;
}

interface InstallmentStats {
  overdue: { count: number; total: number };
  pendingToday: { count: number; total: number };
  inDay: { count: number; total: number };
}

const fetchTotalSales = async (): Promise<number> => {
  const { data } = await api.get<{ totalSales: number }>("/sales/total-sales");
  return Number(data.totalSales) || 0;
};

const fetchSalesLast7Days = async (): Promise<SalesDataPoint[]> => {
  const { data } = await api.get<{ salesLast7Days: SalesDataPoint[] }>("/sales/sales-last-7-days");
  return data.salesLast7Days.map(item => ({ ...item, totalSales: Number(item.totalSales) || 0 }));
};

const fetchInstallmentStats = async (): Promise<InstallmentStats> => {
  const { data } = await api.get<InstallmentStats>("/installments/stats");
  return data;
};

export const Dashboard: React.FC = () => {
  const today = format(new Date(), 'dd/MM/yyyy');

  const { data: totalSales, isLoading: isLoadingTotalSales, error: errorTotalSales } = useQuery<number, Error>({ queryKey: ['totalSales'], queryFn: fetchTotalSales });
  const { data: salesLast7Days, isLoading: isLoadingSalesLast7Days, error: errorSalesLast7Days } = useQuery<SalesDataPoint[], Error>({ queryKey: ['salesLast7Days'], queryFn: fetchSalesLast7Days });
  const { data: installmentStats, isLoading: isLoadingInstallmentStats, error: errorInstallmentStats } = useQuery<InstallmentStats, Error>({ queryKey: ['installmentStats'], queryFn: fetchInstallmentStats });

  if (isLoadingTotalSales || isLoadingSalesLast7Days || isLoadingInstallmentStats) {
    return <div>Carregando...</div>;
  }

  if (errorTotalSales || errorSalesLast7Days || errorInstallmentStats) {
    return <div>Ocorreu um erro ao carregar os dados do dashboard.</div>;
  }

  const installmentChartData = [
    { name: 'Em Dia', value: installmentStats?.inDay?.count ?? 0, fill: '#48BB78' },
    { name: 'Atrasado', value: installmentStats?.overdue?.count ?? 0, fill: '#FC8181' },
  ];

  const formattedSalesLast7Days = salesLast7Days?.map((item) => ({
    name: format(new Date(item.saleDate), 'dd/MM'),
    sales: item.totalSales,
  })) || [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary to-secondary rounded-card shadow-card p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Bem-vindo ao Amor Infinito!</h1>
        <p className="text-white text-opacity-90">Hoje é {today}. Aqui está um resumo do seu negócio.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary bg-opacity-10 text-primary rounded-lg">
              <FiTrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Total de Vendas do Mês</p>
              <p className="text-2xl font-bold text-gray-900">R$ {Number(totalSales || 0).toFixed(2)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-success bg-opacity-10 text-success rounded-lg">
              <FiCheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Total a Receber</p>
              <p className="text-2xl font-bold text-gray-900">R$ {Number((installmentStats?.inDay?.total || 0) + (installmentStats?.overdue?.total || 0)).toFixed(2)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-secondary bg-opacity-10 text-secondary rounded-lg">
              <FiAlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Parcelas Vencidas Hoje</p>
              <p className="text-2xl font-bold text-gray-900">{installmentStats?.pendingToday?.count ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-error bg-opacity-10 text-error rounded-lg">
              <FiDollarSign size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Clientes Inadimplentes</p>
              <p className="text-2xl font-bold text-gray-900">{installmentStats?.overdue?.count ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Vendas dos Últimos 7 Dias" subtitle="Evolução diária de vendas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedSalesLast7Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#6C63FF" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6C63FF' }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Status do Crediário" subtitle="Distribuição de parcelas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={installmentChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};