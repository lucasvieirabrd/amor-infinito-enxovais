import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiPlus, FiMapPin, FiEdit, FiTrash2 } from 'react-icons/fi';
import { Button, Input, Modal, Table, Card, Loading } from '../../components/ui';
import axios from 'axios';

interface Customer {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email?: string;
  addressStreet?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  cep?: string;
}

export const Customers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<any>(null);
  const queryClient = useQueryClient();

  // Busca de clientes via API
  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const response = await api.get('/customers', { params: { search } });
      return response.data.data as Customer[];
    },
  });

  // Mutação para cadastrar novo cliente
  const registerMutation = useMutation({
    mutationFn: (newCustomer: Partial<Customer>) => {
      if (editingId) {
        return api.put(`/customers/${editingId}`, newCustomer);
      }
      return api.post('/customers', newCustomer);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsModalOpen(false);
      setFormData({});
      setEditingId(null);
    },
    onError: (error: any) => {
      console.error("Erro ao salvar cliente:", error);
      alert(`Erro ao salvar cliente: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`);
    },
  });

  // Mutação para importar CSV
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formDataFile = new FormData();
      formDataFile.append('file', file);
      const response = await api.post('/customers/import-csv', formDataFile, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setImportProgress(100);
    },
    onError: (error: any) => {
      console.error('Erro ao importar CSV:', error);
      alert(`Erro ao importar: ${error.response?.data?.message || error.message}`);
    },
  });

  const handleImportCSV = () => {
    if (!importFile) {
      alert('Selecione um arquivo CSV');
      return;
    }
    setImportProgress(10);
    importMutation.mutate(importFile);
  };

  // Integração ViaCEP
  const handleCepBlur = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const response = await axios.get(`https://viacep.com.br/ws/${cleanCep}/json/`);
        if (!response.data.erro) {
          setFormData(prev => ({
            ...prev,
            addressStreet: response.data.logradouro,
            addressNeighborhood: response.data.bairro,
            addressCity: response.data.localidade,
            addressState: response.data.uf,
          }));
        }
      } catch (err) {
        console.error('Erro ao buscar CEP');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Dados do formulário enviados:", formData);
    registerMutation.mutate(formData);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setFormData(customer);
    setIsModalOpen(true);
  };

  const handleSell = (customer: Customer) => {
    // Navegar para a página de vendas com o cliente pré-selecionado
    // Isso será implementado com React Router
    window.location.href = `/sales?customerId=${customer.id}`;
  };

  const columns = [
    {
      key: 'name' as const,
      label: 'Cliente',
      render: (value: string, item: Customer) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm">
            {item.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'cpf' as const,
      label: 'CPF',
    },
    {
      key: 'phone' as const,
      label: 'Telefone',
    },
    {
      key: 'addressCity' as const,
      label: 'Localização',
      render: (value: string, item: Customer) => (
        <span>{value ? `${value}/${item.addressState}` : '-'}</span>
      ),
    },
    {
      key: 'actions' as const,
      label: 'Ações',
      render: (_: any, item: Customer) => (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEdit(item)}
            className="flex items-center gap-1"
          >
            <FiEdit size={16} />
            Editar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSell(item)}
            className="flex items-center gap-1"
          >
            Vender
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600 mt-1">Gestão da base de clientes da Amor Infinito</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setEditingId(null);
              setFormData({});
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <FiPlus size={20} />
            Novo Cliente
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2"
          >
            ⬆ Importar CSV
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-10 w-full"
          />
        </div>
      </Card>

      {/* Customers Table */}
      <Card>
        {isLoading ? (
          <Loading variant="skeleton" />
        ) : (
          <Table
            columns={columns}
            data={customers || []}
            keyExtractor={(item) => item.id}
            emptyMessage="Nenhum cliente encontrado"
          />
        )}
      </Card>

      {/* Modal de Cadastro/Edição */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFormData({});
          setEditingId(null);
        }}
        title={editingId ? "Editar Cliente" : "Cadastrar Novo Cliente"}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setFormData({});
                setEditingId(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={registerMutation.isPending}
              onClick={handleSubmit}
            >
              {editingId ? 'Atualizar Cliente' : 'Salvar Cliente'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Informações Pessoais</h3>
            <Input
              label="Nome Completo"
              placeholder="João Silva"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="CPF"
                placeholder="000.000.000-00"
                value={formData.cpf || ''}
                onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                required
              />
              <Input
                label="WhatsApp"
                placeholder="(11) 98765-4321"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <Input
              label="E-mail"
              type="email"
              placeholder="joao@email.com"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          {/* Address Information */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FiMapPin size={16} />
              Endereço
            </h3>
            <Input
              label="CEP"
              placeholder="00000-000"
              value={formData.cep || ''}
              onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
              onBlur={(e) => handleCepBlur(e.target.value)}
            />
            <Input
              label="Rua/Logradouro"
              placeholder="Rua das Flores"
              value={formData.addressStreet || ''}
              onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Bairro"
                placeholder="Centro"
                value={formData.addressNeighborhood || ''}
                onChange={(e) => setFormData({ ...formData, addressNeighborhood: e.target.value })}
              />
              <Input
                label="Cidade"
                placeholder="São Paulo"
                value={formData.addressCity || ''}
                onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
              />
            </div>
            <Input
              label="UF"
              placeholder="SP"
              maxLength={2}
              value={formData.addressState || ''}
              onChange={(e) => setFormData({ ...formData, addressState: e.target.value.toUpperCase() })}
            />
          </div>
        </form>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFile(null);
          setImportProgress(0);
          setImportResult(null);
        }}
        title="Importar Clientes e Crediário"
        size="lg"
      >
        {!importResult ? (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Selecione um arquivo CSV com as colunas: Nome do Cliente, Telefone, Email, CPF, Endereço, Cidade, Estado, CEP, Dívida Total, Total de Parcelas, Valor da Parcela, Parcelas Pagas, Vencimento da Parcela
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
                id="csv-file"
              />
              <label htmlFor="csv-file" className="cursor-pointer">
                <p className="text-gray-600">
                  {importFile ? importFile.name : 'Clique para selecionar um arquivo CSV'}
                </p>
              </label>
            </div>
            {importProgress > 0 && importProgress < 100 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportProgress(0);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleImportCSV}
                loading={importMutation.isPending}
                disabled={!importFile}
              >
                Iniciar Importação
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-success bg-opacity-10 border border-success rounded-lg p-4">
              <p className="text-success font-semibold">Importação concluída com sucesso!</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{importResult.newCustomers}</p>
                  <p className="text-sm text-gray-600">Clientes Novos</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{importResult.existingCustomers}</p>
                  <p className="text-sm text-gray-600">Clientes Existentes</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{importResult.totalDebts}</p>
                  <p className="text-sm text-gray-600">Dívidas Importadas</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{importResult.totalInstallments}</p>
                  <p className="text-sm text-gray-600">Parcelas Geradas</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{importResult.paidInstallments}</p>
                  <p className="text-sm text-gray-600">Parcelas Pagas</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-warning">{importResult.pendingInstallments}</p>
                  <p className="text-sm text-gray-600">Parcelas Pendentes</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-3xl font-bold text-error">{importResult.overdueInstallments}</p>
                  <p className="text-sm text-gray-600">Parcelas em Atraso</p>
                </div>
              </Card>
            </div>
            {importResult.errors && importResult.errors.length > 0 && (
              <div className="bg-error bg-opacity-10 border border-error rounded-lg p-4">
                <p className="font-semibold text-error mb-2">Erros encontrados:</p>
                <ul className="text-sm text-error space-y-1">
                  {importResult.errors.map((err: any, idx: number) => (
                    <li key={idx}>Linha {err.line}: {err.customer} - {err.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportProgress(0);
                  setImportResult(null);
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
