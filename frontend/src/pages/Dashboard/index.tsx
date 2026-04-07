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

// Dados mockados para visualização inicial
const salesData = [
  { name: 'Seg', sales: 4000 },
  { name: 'Ter', sales: 3000 },
  { name: 'Qua', sales: 2000 },
  { name: 'Qui', sales: 2780 },
  { name: 'Sex', sales: 1890 },
  { name: 'Sáb', sales: 2390 },
  { name: 'Dom', sales: 3490 },
];

const installmentData = [
  { name: 'Em Dia', value: 85, fill: '#48BB78' },
  { name: 'Atrasado', value: 15, fill: '#FC8181' },
];

const upcomingInstallments = [
  { id: 1, customer: 'João Silva', amount: 150.00, dueDate: '2026-04-10' },
  { id: 2, customer: 'Maria Santos', amount: 200.00, dueDate: '2026-04-12' },
  { id: 3, customer: 'Pedro Costa', amount: 175.50, dueDate: '2026-04-15' },
  { id: 4, customer: 'Ana Oliveira', amount: 300.00, dueDate: '2026-04-18' },
  { id: 5, customer: 'Carlos Ferreira', amount: 125.00, dueDate: '2026-04-20' },
];

const recentCustomers = [
  { id: 1, name: 'João Silva', email: 'joao@email.com', phone: '(11) 98765-4321', createdAt: '2026-04-05' },
  { id: 2, name: 'Maria Santos', email: 'maria@email.com', phone: '(11) 98765-4322', createdAt: '2026-04-04' },
  { id: 3, name: 'Pedro Costa', email: 'pedro@email.com', phone: '(11) 98765-4323', createdAt: '2026-04-03' },
  { id: 4, name: 'Ana Oliveira', email: 'ana@email.com', phone: '(11) 98765-4324', createdAt: '2026-04-02' },
  { id: 5, name: 'Carlos Ferreira', email: 'carlos@email.com', phone: '(11) 98765-4325', createdAt: '2026-04-01' },
];

export const Dashboard: React.FC = () => {
  const today = format(new Date(), 'dd/MM/yyyy');

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
              <p className="text-2xl font-bold text-gray-900">R$ 12.480,00</p>
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
              <p className="text-2xl font-bold text-gray-900">R$ 8.750,00</p>
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
              <p className="text-2xl font-bold text-gray-900">12</p>
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
              <p className="text-2xl font-bold text-gray-900">8</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Vendas dos Últimos 7 Dias" subtitle="Evolução diária de vendas">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData}>
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
              <BarChart data={installmentData} layout="vertical">
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

      {/* Upcoming Installments and Recent Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Installments */}
        <Card title="Próximas Parcelas a Vencer" subtitle="Próximos 15 dias">
          <div className="space-y-3">
            {upcomingInstallments.map((installment) => (
              <div key={installment.id} className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-gray-200 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900">{installment.customer}</p>
                  <p className="text-xs text-gray-500">Vence em {format(new Date(installment.dueDate), 'dd/MM/yyyy')}</p>
                </div>
                <p className="text-sm font-semibold text-primary">R$ {installment.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Customers */}
        <Card title="Últimos Clientes Cadastrados" subtitle="Novos clientes">
          <div className="space-y-3">
            {recentCustomers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-gray-200 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                  <p className="text-xs text-gray-500">{customer.email}</p>
                </div>
                <Badge variant="info">{format(new Date(customer.createdAt), 'dd/MM')}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Alerts and Recommendations */}
      <Card title="Alertas e Recomendações">
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-secondary bg-opacity-10 rounded-lg border border-secondary border-opacity-20">
            <FiAlertTriangle className="text-secondary mt-1 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">12 Parcelas Vencidas Hoje</p>
              <p className="text-xs text-gray-600 mt-1">A régua de cobrança automática será disparada às 08h00.</p>
            </div>
            <Button variant="secondary" size="sm">Ver Detalhes</Button>
          </div>

          <div className="flex items-start gap-4 p-4 bg-primary bg-opacity-10 rounded-lg border border-primary border-opacity-20">
            <FiPackage className="text-primary mt-1 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Estoque Baixo: Jogo de Lençol King</p>
              <p className="text-xs text-gray-600 mt-1">Apenas 2 unidades restantes na planilha do Google.</p>
            </div>
            <Button variant="secondary" size="sm">Repor Estoque</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
