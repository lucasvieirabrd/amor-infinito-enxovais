import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  FiDownload, FiFilter, FiAlertTriangle, FiCheckCircle, FiClock, FiTrendingUp
} from 'react-icons/fi';
import { Button, Card, Badge, Input, Loading } from '../../components/ui';
import { format } from 'date-fns';

interface BillingRecord {
  id: string;
  customerName: string;
  installmentNumber: number;
  dueDate: string;
  originalAmount: number;
  paidAmount: number | null;
  paymentDate: string | null;
  status: 'pending' | 'paid' | 'overdue';
  daysOverdue?: number;
}

interface BillingStats {
  totalDue: number;
  totalOverdue: number;
  totalPaid: number;
  overdueCount: number;
  pendingCount: number;
}

export const Billing: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Fetch billing records
  const { data: billingRecords, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['billing-records', statusFilter, dateRange],
    queryFn: async () => {
      const response = await api.get('/installments/billing', {
        params: {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          startDate: dateRange.start || undefined,
          endDate: dateRange.end || undefined,
        }
      });
      return response.data as BillingRecord[];
    },
  });

  // Fetch billing stats
  const { data: stats } = useQuery({
    queryKey: ['billing-stats'],
    queryFn: async () => {
      const response = await api.get('/installments/stats');
      return response.data as BillingStats;
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Pago</Badge>;
      case 'overdue':
        return <Badge variant="error">Atrasado</Badge>;
      case 'pending':
        return <Badge variant="info">Pendente</Badge>;
      default:
        return <Badge variant="warning">Desconhecido</Badge>;
    }
  };

  const handleExportCSV = () => {
    if (!billingRecords) return;

    const headers = ['Cliente', 'Parcela', 'Vencimento', 'Valor Original', 'Valor Pago', 'Data Pagamento', 'Status'];
    const rows = billingRecords.map(record => [
      record.customerName,
      record.installmentNumber,
      format(new Date(record.dueDate), 'dd/MM/yyyy'),
      record.originalAmount.toFixed(2),
      record.paidAmount?.toFixed(2) || '-',
      record.paymentDate ? format(new Date(record.paymentDate), 'dd/MM/yyyy') : '-',
      record.status,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cobranca_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Cobrança</h1>
        <p className="text-gray-600 mt-1">Acompanhe o status de todas as parcelas</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary bg-opacity-10 text-primary rounded-lg">
              <FiTrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Total a Receber</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats?.totalDue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-error bg-opacity-10 text-error rounded-lg">
              <FiAlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Em Atraso</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats?.totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
              </p>
              <p className="text-xs text-gray-500 mt-1">{stats?.overdueCount || 0} parcelas</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-success bg-opacity-10 text-success rounded-lg">
              <FiCheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Recebido</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats?.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-secondary bg-opacity-10 text-secondary rounded-lg">
              <FiClock size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Pendente</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.pendingCount || 0}</p>
              <p className="text-xs text-gray-500 mt-1">parcelas</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <FiFilter size={20} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filtros</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="input-base w-full"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendente</option>
                <option value="overdue">Atrasado</option>
                <option value="paid">Pago</option>
              </select>
            </div>

            <Input
              label="Data Inicial"
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />

            <Input
              label="Data Final"
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => {
                setStatusFilter('all');
                setDateRange({ start: '', end: '' });
              }}
            >
              Limpar Filtros
            </Button>
            <Button
              variant="primary"
              onClick={handleExportCSV}
              className="flex items-center gap-2"
            >
              <FiDownload size={18} />
              Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Billing Records Table */}
      <Card title="Registros de Cobrança">
        {isLoadingRecords ? (
          <Loading variant="skeleton" />
        ) : billingRecords?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhum registro de cobrança encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Parcela</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vencimento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor Original</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valor Pago</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Data Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {billingRecords?.map((record) => (
                  <tr key={record.id} className="hover:bg-background transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {record.customerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.installmentNumber}ª Parcela
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {format(new Date(record.dueDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      R$ {record.originalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.paidAmount ? (
                        <span className="font-semibold text-success">
                          R$ {record.paidAmount.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.paymentDate ? format(new Date(record.paymentDate), 'dd/MM/yyyy') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
