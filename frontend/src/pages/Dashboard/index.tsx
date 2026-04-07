import React from 'react';
import { 
  FiTrendingUp, FiAlertTriangle, FiCheckCircle, FiDollarSign 
} from 'react-icons/fi';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

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
  { name: 'Em Dia', value: 85, fill: '#10B981' },
  { name: 'Atrasado', value: 15, fill: '#EF4444' },
];

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <p className="text-gray-600">Visão geral da Amor Infinito Enxovais</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mr-4">
            <FiTrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Vendas Hoje</p>
            <p className="text-xl font-bold text-gray-800">R$ 1.250,00</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg mr-4">
            <FiCheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Recebido (Mês)</p>
            <p className="text-xl font-bold text-gray-800">R$ 12.480,00</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg mr-4">
            <FiAlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Inadimplência</p>
            <p className="text-xl font-bold text-gray-800">R$ 3.120,00</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg mr-4">
            <FiDollarSign size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Ticket Médio</p>
            <p className="text-xl font-bold text-gray-800">R$ 450,00</p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Evolução de Vendas (Semana)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis hide />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#4F46E5" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#4F46E5' }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Status do Crediário</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={installmentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Actions / Recent Activity */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Ações Recomendadas</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-100">
            <div className="flex items-center">
              <FiAlertTriangle className="text-yellow-600 mr-3" size={20} />
              <div>
                <p className="text-sm font-bold text-yellow-800">12 Parcelas Vencidas Hoje</p>
                <p className="text-xs text-yellow-700">A régua de cobrança automática será disparada às 08h00.</p>
              </div>
            </div>
            <button className="text-sm font-bold text-yellow-800 hover:underline">Ver Detalhes</button>
          </div>

          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center">
              <FiPackage className="text-blue-600 mr-3" size={20} />
              <div>
                <p className="text-sm font-bold text-blue-800">Estoque Baixo: Jogo de Lençol King</p>
                <p className="text-xs text-blue-700">Apenas 2 unidades restantes na planilha do Google.</p>
              </div>
            </div>
            <button className="text-sm font-bold text-blue-800 hover:underline">Repor Estoque</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FiPackage = ({ className, size }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} height={size} 
    viewBox="0 0 24 24" fill="none" 
    stroke="currentColor" strokeWidth="2" 
    strokeLinecap="round" strokeLinejoin="round" 
    className={className}
  >
    <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
  </svg>
);
