import React, { useRef, useState } from 'react';
import { FiUpload, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import { Button, Modal, Loading } from './ui';
import api from '../services/api';

interface CSVImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
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
            <Button variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={loading}
              disabled={!file}
            >
              Importar
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-6">
          {/* Success Summary */}
          <div className="bg-success bg-opacity-10 border border-success border-opacity-20 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <FiCheck className="text-success" size={24} />
              <h3 className="text-lg font-semibold text-gray-900">Importação Concluída!</h3>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-success">{result.success}</span> cliente{result.success !== 1 ? 's' : ''} importado{result.success !== 1 ? 's' : ''} com sucesso.
              </p>
              {result.failed > 0 && (
                <p className="text-sm text-gray-700">
                  <span className="font-semibold text-error">{result.failed}</span> cliente{result.failed !== 1 ? 's' : ''} com erro.
                </p>
              )}
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="bg-error bg-opacity-10 border border-error border-opacity-20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FiAlertCircle className="text-error" size={20} />
                <h4 className="font-semibold text-gray-900">Erros Encontrados:</h4>
              </div>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((err, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    • {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reset Button */}
          <Button
            variant="secondary"
            onClick={handleReset}
            className="w-full"
          >
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
