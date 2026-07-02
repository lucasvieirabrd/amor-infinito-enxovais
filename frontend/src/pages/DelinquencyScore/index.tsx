import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiDownload, FiSearch, FiAlertTriangle } from 'react-icons/fi';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';

type Risk = 'low' | 'medium' | 'high';

interface ScoreRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  overdue_count: number;
  total_days_overdue: number;
  late_payments_count: number;
  renegotiations_count: number;
  date_changes_count: number;
  score: number;
  risk: Risk;
}

interface ScoreResult {
  data: ScoreRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const RISK_LABELS: Record<Risk, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const RISK_CLASSES: Record<Risk, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

export const DelinquencyScore: React.FC = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<Risk | ''>('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  if (user && user.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search && { search }),
    ...(riskFilter && { riskFilter }),
  });

  const { data, isLoading } = useQuery<ScoreResult>({
    queryKey: ['delinquency-score', page, search, riskFilter],
    queryFn: async () => {
      const res = await api.get(`/reports/delinquency-score?${params}`);
      return res.data;
    },
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleRiskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRiskFilter(e.target.value as Risk | '');
    setPage(1);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams({
        format,
        ...(search && { search }),
        ...(riskFilter && { riskFilter }),
      });
      const res = await api.get(`/reports/delinquency-score?${exportParams}`, {
        responseType: 'blob',
      });
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const mime =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `score-inadimplencia.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FiAlertTriangle size={24} className="text-red-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Score de Inadimplência</h1>
            <p className="text-sm text-gray-500">Ranking de risco por cliente · somente administradores</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50"
          >
            <FiDownload size={16} />
            PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 text-sm disabled:opacity-50"
          >
            <FiDownload size={16} />
            Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={riskFilter}
          onChange={handleRiskChange}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos os riscos</option>
          <option value="high">🔴 Alto</option>
          <option value="medium">🟡 Médio</option>
          <option value="low">🟢 Baixo</option>
        </select>
      </div>

      {/* Summary counts */}
      {data && (
        <div className="flex gap-3 mb-4 text-sm text-gray-600">
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full">
            🔴 Alto: {data.data.filter(r => r.risk === 'high').length}
          </span>
          <span className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full">
            🟡 Médio: {data.data.filter(r => r.risk === 'medium').length}
          </span>
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">
            🟢 Baixo: {data.data.filter(r => r.risk === 'low').length}
          </span>
          <span className="text-gray-500 ml-auto">{data.total} cliente(s)</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">CPF</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Telefone</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Parc. Vencidas</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Dias Atraso</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Pgtos. Atrasados</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Renegoc.</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Alt. Data</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Score</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Risco</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">
                  Nenhum cliente encontrado com histórico de crediário.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rank = (page - 1) * limit + idx + 1;
                return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{rank}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600">{row.cpf || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.overdue_count > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {row.overdue_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.total_days_overdue > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {row.total_days_overdue}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.late_payments_count}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.renegotiations_count}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.date_changes_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-gray-800">{row.score}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_CLASSES[row.risk]}`}
                      >
                        {RISK_LABELS[row.risk]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Score legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-2">Como o Score é calculado</p>
        <p>• Parcelas vencidas ativas: <strong>×30</strong> pontos cada</p>
        <p>• Total de dias em atraso (máx. 365d): <strong>×0,5</strong> pontos por dia</p>
        <p>• Histórico de pagamentos atrasados: <strong>×5</strong> pontos cada</p>
        <p>• Renegociações de valor: <strong>×20</strong> pontos cada</p>
        <p>• Alterações de data de vencimento: <strong>×3</strong> pontos cada</p>
        <p className="mt-2">
          Risco: <span className="text-green-700 font-semibold">Baixo &lt;30</span> ·{' '}
          <span className="text-yellow-700 font-semibold">Médio 30–79</span> ·{' '}
          <span className="text-red-700 font-semibold">Alto ≥80</span>
        </p>
      </div>
    </div>
  );
};
