import React, { useState } from 'react';
import { Modal } from './ui';
import api from '../services/api';

interface CarneModalProps {
  isOpen: boolean;
  saleId: string;
  saleNumber: string;
  customerName: string;
  installmentsCount: number;
  onClose: () => void;
}

async function fetchCarnePdf(saleId: string): Promise<Blob> {
  const response = await api.get(`/sales/${saleId}/carne`, { responseType: 'blob' });
  return new Blob([response.data], { type: 'application/pdf' });
}

export const CarneModal: React.FC<CarneModalProps> = ({
  isOpen,
  saleId,
  saleNumber,
  customerName,
  installmentsCount,
  onClose,
}) => {
  const [loading, setLoading] = useState<'download' | 'print' | 'promissoria' | 'ordem' | null>(null);

  const handleDownload = async () => {
    setLoading('download');
    try {
      const blob = await fetchCarnePdf(saleId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carne-${saleNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar carnê. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  const handlePrint = async () => {
    setLoading('print');
    try {
      const blob = await fetchCarnePdf(saleId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      alert('Erro ao gerar carnê. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  const handlePromissoria = async () => {
    setLoading('promissoria');
    try {
      const response = await api.get(`/sales/${saleId}/promissoria`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      alert('Erro ao gerar promissória. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  const handleOrdem = async () => {
    setLoading('ordem');
    try {
      const response = await api.get(`/sales/${saleId}/ordem`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      alert('Erro ao gerar ordem de venda. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col items-center gap-5 py-1">
        {/* Header verde */}
        <div className="w-full bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-center">
          <div className="text-3xl mb-1">✅</div>
          <h2 className="text-base font-bold text-green-800">Venda registrada!</h2>
          <p className="text-sm font-semibold text-green-700 mt-0.5">{saleNumber}</p>
        </div>

        {/* Info */}
        <div className="text-sm text-gray-600 text-center space-y-0.5">
          <p><span className="font-semibold text-gray-800">Cliente:</span> {customerName}</p>
          <p><span className="font-semibold text-gray-800">Parcelas:</span> {installmentsCount}x</p>
        </div>

        {/* Botões */}
        <div className="w-full space-y-3">
          <button
            onClick={handleDownload}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold text-sm transition-colors"
          >
            {loading === 'download' ? 'Gerando PDF...' : '⬇ Baixar Carnê (PDF)'}
          </button>

          <button
            onClick={handlePrint}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-semibold text-sm transition-colors"
          >
            {loading === 'print' ? 'Abrindo...' : '🖨 Imprimir Carnê'}
          </button>

          <button
            onClick={handlePromissoria}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-lg border border-blue-300 hover:bg-blue-50 disabled:opacity-50 text-blue-700 font-semibold text-sm transition-colors"
          >
            {loading === 'promissoria' ? 'Gerando...' : '📄 Imprimir Promissória'}
          </button>

          <button
            onClick={handleOrdem}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-lg border border-green-300 hover:bg-green-50 disabled:opacity-50 text-green-700 font-semibold text-sm transition-colors"
          >
            {loading === 'ordem' ? 'Gerando...' : '🗒 Imprimir Ordem de Venda'}
          </button>

          <button
            onClick={onClose}
            className="w-full py-1.5 text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            Pular — gerar depois na tela da venda
          </button>
        </div>
      </div>
    </Modal>
  );
};
