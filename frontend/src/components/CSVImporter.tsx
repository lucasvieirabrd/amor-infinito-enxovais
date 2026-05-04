import React, { useRef, useState } from 'react';
import { FiUpload, FiCheck, FiX, FiAlertCircle, FiInfo } from 'react-icons/fi';
import { Button, Modal, Loading } from './ui';
import api from '../services/api';

interface CSVImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ImportResult {
  newCustomers: number;
  existingCustomers: number;
  totalDebts: number;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  overdueInstallments: number;
  errors: Array<{ line: number; customer: string; reason: string }>;
  notes: Array<{ line: number; customer: string; message: string }>;
}

const CSVImporter: React.FC<CSVImporterProps> = ({ isOpen, onClose, onSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Por favor, selecione um arquivo CSV válido.');
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/customers/import-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao importar arquivo CSV.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setFile(null);
    setResult(null);
    setError(null);
    onClose();
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Clientes via CSV"
      size="lg"
      footer={
        result ? (
          <Button variant="primary" onClick={handleClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={loading}
              disabled={!file || loading}
            >
              {loading ? 'Importando...' : 'Importar'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <FiCheck className="text-green-600" size={22} />
              <h3 className="text-base font-semibold text-gray-900">Importação Concluída!</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-700">
              <span>Clientes novos: <strong className="text-green-700">{result.newCustomers}</strong></span>
              <span>Clientes existentes: <strong>{result.existingCustomers}</strong></span>
              <span>Dívidas importadas: <strong>{result.totalDebts}</strong></span>
              <span>Parcelas no total: <strong>{result.totalInstallments}</strong></span>
              <span>Pagas: <strong className="text-green-700">{result.paidInstallments}</strong></span>
              <span>Pendentes: <strong className="text-yellow-700">{result.pendingInstallments}</strong></span>
              <span>Atrasadas: <strong className="text-red-600">{result.overdueInstallments}</strong></span>
              {result.errors.length > 0 && (
                <span>Linhas com erro: <strong className="text-red-600">{result.errors.length}</strong></span>
              )}
            </div>
          </div>

          {/* Avisos informativos (CPF provisório, duplicatas) */}
          {result.notes && result.notes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiInfo className="text-blue-600" size={18} />
                <h4 className="font-semibold text-gray-900 text-sm">Avisos ({result.notes.length}):</h4>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.notes.map((n, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    <span className="font-medium text-blue-700">Linha {n.line}</span> — {n.customer}: {n.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Erros */}
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiAlertCircle className="text-red-600" size={18} />
                <h4 className="font-semibold text-gray-900 text-sm">Erros ({result.errors.length}):</h4>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((err, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    <span className="font-medium text-red-700">Linha {err.line}</span> — {err.customer}: {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="secondary" onClick={handleReset} className="w-full">
            Importar Outro Arquivo
          </Button>
        </div>
      ) : loading ? (
        <Loading variant="spinner" text="Processando arquivo CSV..." />
      ) : (
        <div className="space-y-6">
          {/* Instructions */}
          <div className="bg-background rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-gray-900">Formato do CSV:</h4>
            <p className="text-sm text-gray-600">
              O arquivo deve conter as seguintes colunas (na primeira linha):
            </p>
            <code className="block text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
              name,cpf,phone,email,addressStreet,addressNeighborhood,addressCity,addressState,cep
            </code>
          </div>

          {/* Example */}
          <div className="bg-background rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-gray-900">Exemplo:</h4>
            <code className="block text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
              João Silva,123.456.789-00,(11) 98765-4321,joao@email.com,Rua das Flores 123,Centro,São Paulo,SP,01310-100
            </code>
          </div>

          {/* File Input */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-primary rounded-lg p-8 hover:bg-primary hover:bg-opacity-5 transition-colors text-center"
            >
              <FiUpload className="mx-auto mb-2 text-primary" size={32} />
              <p className="text-sm font-semibold text-gray-900">
                {file ? file.name : 'Clique para selecionar um arquivo CSV'}
              </p>
              <p className="text-xs text-gray-500 mt-1">ou arraste um arquivo aqui</p>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-error bg-opacity-10 border border-error border-opacity-20 rounded-lg p-4 flex items-start gap-3">
              <FiX className="text-error mt-1 flex-shrink-0" size={20} />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default CSVImporter;
