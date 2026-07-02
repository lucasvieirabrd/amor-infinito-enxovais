import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiDownload, FiSearch, FiAlertTriangle } from 'react-icons/fi';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';

type RiskLevel = 'good' | 'attention' | 'high_risk';

interface ScoreRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  renegotiations_count: number;
  has_renegotiation: boolean;
  late_payments: number;
  overdue_8_30: number;
  overdue_30plus: number;
  date_changes: number;
  score: number;
  risk: RiskLevel;
}

interface ScoreResult {
  data: ScoreRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const RISK_LABELS: Record<RiskLevel, string> = {
  good:       'Bom pagador',
  attention:  'Atenção',
  high_risk:  'Alto risco',
};

const RISK_CLASSES: Record<RiskLevel, string> = {
  good:       'bg-green-100 text-green-700',
  attention:  'bg-yellow-100 text-yellow-700',
  high_risk:  'bg-red-100 text-red-700',
};

export const DelinquencyScore: React.FC = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | ''>('');
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
    setRiskFilter(e.target.value as RiskLevel | '');
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

  const countByRisk = (level: RiskLevel) => data?.data.filter(r => r.risk === level).length ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FiAlertTriangle size={24} className="text-red-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Score de Inadimplência</h1>
            <p className="text-sm text-gray-500">
              Ranking estilo Serasa · 1000 = excelente · piores no topo · somente administradores
            </p>
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
          <option value="">Todos os níveis</option>
          <option value="high_risk">🔴 Alto risco (&lt;400)</option>
          <option value="attention">🟡 Atenção (400–699)</option>
          <option value="good">🟢 Bom pagador (≥700)</option>
        </select>
      </div>

      {/* Summary counts */}
      {data && (
        <div className="flex flex-wrap gap-3 mb-4 text-sm">
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full">
            🔴 Alto risco: {countByRisk('high_risk')}
          </span>
          <span className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full">
            🟡 Atenção: {countByRisk('attention')}
          </span>
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">
            🟢 Bom pagador: {countByRisk('good')}
          </span>
          <span className="text-gray-500 ml-auto">{data.total} cliente(s) com histórico de crediário</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600 w-10">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">CPF</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Telefone</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Score</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Risco</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600" title="Pagamentos feitos com atraso (sinal mais forte)">Pgtos. Atrasados</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600" title="Parcelas vencidas há 8–30 dias">Parc. 8–30d</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600" title="Parcelas vencidas há mais de 30 dias">Parc. 30+d</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600" title="Alterações de data de vencimento">Alt. Data</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600" title="Número de renegociações (informativo)">Renegoc.</th>
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
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{row.name}</span>
                      {row.has_renegotiation && (
                        <span
                          className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded"
                          title="Métricas calculadas sobre o acordo de renegociação"
                        >
                          ren.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.cpf || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-lg text-gray-800">{row.score}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_CLASSES[row.risk]}`}>
                        {RISK_LABELS[row.risk]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.late_payments > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                        {row.late_payments}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.overdue_8_30 > 0 ? 'text-orange-600 font-semibold' : 'text-gray-400'}>
                        {row.overdue_8_30}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={row.overdue_30plus > 0 ? 'text-red-700 font-bold' : 'text-gray-400'}>
                        {row.overdue_30plus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.date_changes}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{row.renegotiations_count}</td>
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
          <span>Página {page} de {totalPages}</span>
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

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-2">Como o Score funciona (estilo Serasa)</p>
        <p>Todo cliente começa com <strong>1000 pontos</strong> e perde pontos por comportamentos ruins. Score alto = bom pagador.</p>
        <div className="mt-2 space-y-0.5">
          <p>• <strong>Pagamentos feitos com atraso (fator mais forte):</strong> −15 pts cada</p>
          <p>• Parcelas vencidas há 8–30 dias: −10 pts cada</p>
          <p>• Parcelas vencidas há mais de 30 dias: −30 pts cada</p>
          <p>• Dias de atraso acima de 7 (soma, máx. 365d): −0,5 pt por dia</p>
          <p>• Alterações de data de vencimento: −5 pts cada (−12 se em renegociação)</p>
        </div>
        <p className="mt-2 text-gray-400 italic">
          Carência de 7 dias: atrasos de 1 a 7 dias não penalizam (pode ser apenas baixa manual pendente).
        </p>
        <p className="mt-1 text-gray-400 italic">
          Renegociação = recomeço limpo: clientes com acordo renegociado são avaliados apenas pelo comportamento pós-acordo.
          O badge <span className="text-purple-600 font-semibold">ren.</span> indica que as métricas são do acordo novo.
        </p>
        <p className="mt-2">
          Faixas:{' '}
          <span className="text-green-700 font-semibold">🟢 Bom pagador ≥700</span> ·{' '}
          <span className="text-yellow-700 font-semibold">🟡 Atenção 400–699</span> ·{' '}
          <span className="text-red-700 font-semibold">🔴 Alto risco &lt;400</span>
        </p>
      </div>
    </div>
  );
};
