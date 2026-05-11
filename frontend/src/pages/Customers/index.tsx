import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiPlus, FiMapPin, FiEdit, FiTrash2, FiChevronLeft, FiChevronRight, FiGitMerge } from 'react-icons/fi';
import { Button, Input, Modal, Table, Card, Loading, Badge } from '../../components/ui';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { MergeCustomersModal } from './MergeCustomersModal';

interface Customer {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  cep?: string;
}

interface PaginatedResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- Máscaras ---

function formatCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3}\.\d{3}\.\d{3})(\d{1,2})/, '$1-$2');
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\(\d{2}\) \d{4})(\d)/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\(\d{2}\) \d{5})(\d)/, '$1-$2');
}

function formatCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d)/, '$1-$2');
}

function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  return formatPhone(local);
}

export const Customers: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<any>(null);
  const queryClient = useQueryClient();

  const ITEMS_PER_PAGE = 20;

  const { data: response, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: async () => {
      const res = await api.get('/customers', {
        params: { search, page, limit: ITEMS_PER_PAGE },
      });
      return res.data as PaginatedResponse;
    },
  });

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
      setPage(1);
    },
    onError: (error: any) => {
      console.error('Erro ao salvar cliente:', error);
      alert(
        `Erro ao salvar cliente: ${
          error.response?.data?.message || error.message || 'Erro desconhecido'
        }`
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: any) => {
      console.error('Erro ao deletar cliente:', error);
      alert(`Erro ao deletar cliente: ${error.response?.data?.message || error.message}`);
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formDataFile = new FormData();
      formDataFile.append('file', file);
      const res = await api.post('/customers/import-csv', formDataFile, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setImportProgress(100);
      setPage(1);
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

  const handleCepChange = async (value: string) => {
    const formatted = formatCep(value);
    setFormData(prev => ({ ...prev, cep: formatted }));
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      try {
        const res = await axios.get(`https://viacep.com.br/ws/${digits}/json/`);
        if (!res.data.erro) {
          setFormData(prev => ({
            ...prev,
            cep: formatted,
            addressStreet: res.data.logradouro,
            addressNeighborhood: res.data.bairro,
            addressCity: res.data.localidade,
            addressState: res.data.uf,
          }));
        }
      } catch {
        // silent — CEP lookup is best-effort
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(formData);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setFormData({
      ...customer,
      phone: displayPhone(customer.phone),
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar este cliente?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSell = (customer: Customer) => {
    window.location.href = `/sales?customerId=${customer.id}`;
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({});
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
    { key: 'cpf' as const, label: 'CPF' },
    { key: 'phone' as const, label: 'Telefone' },
    {
      key: 'addressCity' as const,
      label: 'Cidade',
      render: (value: string) => (
        <div className="flex items-center gap-1 text-gray-600">
          <FiMapPin size={14} />
          {value || '-'}
        </div>
      ),
    },
    {
      key: 'actions' as const,
      label: 'Ações',
      render: (_: any, item: Customer) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition"
            title="Editar"
          >
            <FiEdit size={16} />
          </button>
          <button
            onClick={() => handleSell(item)}
            className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/90 transition"
          >
            Vender
          </button>
          <button
            onClick={() => handleDelete(item.id)}
            className="p-1.5 hover:bg-red-50 rounded text-red-600 transition"
            title="Deletar"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading && !response) {
    return <Loading />;
  }

  const startIndex = ((response?.page || 1) - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE - 1, response?.total || 0);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
            <Badge variant="primary" className="text-lg">
              {response?.total || 0}
            </Badge>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button onClick={() => setIsMergeModalOpen(true)} variant="secondary" className="flex items-center gap-1.5">
                <FiGitMerge size={16} /> Mesclar Clientes
              </Button>
            )}
            <Button onClick={() => setIsImportModalOpen(true)} variant="secondary">
              ⬆ Importar CSV
            </Button>
            <Button
              onClick={() => {
                setEditingId(null);
                setFormData({});
                setIsModalOpen(true);
              }}
            >
              <FiPlus size={18} /> Novo Cliente
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome, CPF ou telefone..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (e.target.value === '') { setSearch(''); setPage(1); }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
                }}
                className="pl-10"
              />
            </div>
          </div>
        </Card>

        <Card className="mb-6">
          {isLoading ? (
            <Loading />
          ) : response?.data && response.data.length > 0 ? (
            <Table columns={columns} data={response?.data || []} keyExtractor={(item) => item.id} />
          ) : (
            <div className="text-center py-8 text-gray-500">
              Nenhum cliente encontrado
            </div>
          )}
        </Card>

        {response && response.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Mostrando {startIndex} a {endIndex} de {response.total} clientes
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <FiChevronLeft size={18} /> Anterior
              </Button>
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg">
                <span className="text-sm text-gray-700">
                  Página {page} de {response.totalPages}
                </span>
              </div>
              <Button
                onClick={() => setPage(Math.min(response.totalPages, page + 1))}
                disabled={page === response.totalPages}
                variant="secondary"
                className="flex items-center gap-2"
              >
                Próxima <FiChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Novo/Editar Cliente */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? 'Editar Cliente' : 'Novo Cliente'}
        size="xl"
      >
        <div className="overflow-y-auto max-h-[65vh] pr-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome */}
            <Input
              label="Nome"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            {/* CPF + Telefone */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="CPF"
                value={formData.cpf || ''}
                onChange={(e) =>
                  setFormData({ ...formData, cpf: formatCpf(e.target.value) })
                }
                placeholder="000.000.000-00"
                required
              />
              <Input
                label="Telefone"
                value={formData.phone || ''}
                onChange={(e) =>
                  setFormData({ ...formData, phone: formatPhone(e.target.value) })
                }
                placeholder="(00) 00000-0000"
                required
              />
            </div>

            {/* E-mail */}
            <Input
              label="E-mail"
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />

            {/* CEP — metade da largura, auto-lookup ao 8º dígito */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="CEP"
                value={formData.cep || ''}
                onChange={(e) => handleCepChange(e.target.value)}
                placeholder="00000-000"
              />
              <div />
            </div>

            {/* Rua + Número */}
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-3">
                <Input
                  label="Rua"
                  value={formData.addressStreet || ''}
                  onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                />
              </div>
              <Input
                label="Número"
                value={formData.addressNumber || ''}
                onChange={(e) => setFormData({ ...formData, addressNumber: e.target.value })}
                placeholder="S/N"
              />
            </div>

            {/* Bairro + Cidade */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Bairro"
                value={formData.addressNeighborhood || ''}
                onChange={(e) => setFormData({ ...formData, addressNeighborhood: e.target.value })}
              />
              <Input
                label="Cidade"
                value={formData.addressCity || ''}
                onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
              />
            </div>

            {/* Estado */}
            <div className="w-1/4">
              <Input
                label="Estado"
                value={formData.addressState || ''}
                onChange={(e) => setFormData({ ...formData, addressState: e.target.value })}
                maxLength={2}
                placeholder="UF"
              />
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={registerMutation.isPending}>
                {registerMutation.isPending
                  ? 'Salvando...'
                  : editingId
                  ? 'Atualizar'
                  : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal de Importação CSV */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFile(null);
          setImportProgress(0);
          setImportResult(null);
        }}
        title="Importar Clientes com Crediário"
      >
        {!importResult ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecione um arquivo CSV com os seguintes campos: Nome, CPF, Telefone, Dívida Total,
              Total de Parcelas, Valor da Parcela, Parcelas Pagas, Vencimento da Parcela
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full"
            />
            {importProgress > 0 && importProgress < 100 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={handleImportCSV} className="flex-1">
                Importar
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportProgress(0);
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Relatório de Importação</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-xs text-gray-600">Novos Clientes</p>
                <p className="text-2xl font-bold text-blue-600">
                  {importResult.newCustomersCount || 0}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <p className="text-xs text-gray-600">Clientes Atualizados</p>
                <p className="text-2xl font-bold text-green-600">
                  {importResult.existingCustomersCount || 0}
                </p>
              </div>
              <div className="bg-purple-50 p-3 rounded">
                <p className="text-xs text-gray-600">Total de Dívidas</p>
                <p className="text-2xl font-bold text-purple-600">
                  R$ {(importResult.totalDebt || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-orange-50 p-3 rounded">
                <p className="text-xs text-gray-600">Parcelas Geradas</p>
                <p className="text-2xl font-bold text-orange-600">
                  {importResult.totalInstallments || 0}
                </p>
              </div>
            </div>
            {importResult.errors && importResult.errors.length > 0 && (
              <div className="bg-red-50 p-3 rounded">
                <p className="text-sm font-semibold text-red-600 mb-2">Erros encontrados:</p>
                <ul className="text-xs text-red-600 space-y-1">
                  {importResult.errors.slice(0, 5).map((err: any, i: number) => (
                    <li key={i}>
                      Linha {err.line}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              onClick={() => {
                setIsImportModalOpen(false);
                setImportFile(null);
                setImportProgress(0);
                setImportResult(null);
              }}
              className="w-full"
            >
              Fechar
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal de Mesclagem de Clientes */}
      <MergeCustomersModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
      />
    </div>
  );
};
