import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { FiSearch, FiPlus, FiMapPin, FiX } from 'react-icons/fi';
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
  const [formData, setFormData] = useState<Partial<Customer>>({});
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
    mutationFn: (newCustomer: Partial<Customer>) => api.post('/customers', newCustomer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsModalOpen(false);
      setFormData({});
    },
  });

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

  // Adicionar onError para depurar falhas na mutação
  registerMutation.onError = (error) => {
    console.error("Erro ao cadastrar cliente:", error);
    alert(`Erro ao cadastrar cliente: ${error.message || 'Erro desconhecido'}`);
  };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
          <p className="text-gray-600">Gestão da base de clientes da Amor Infinito</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center justify-center"
        >
          <FiPlus className="mr-2" /> Novo Cliente
        </button>
      </div>

      {/* Barra de Busca */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input 
            type="text"
            placeholder="Buscar por nome, CPF ou telefone..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary-500 focus:border-primary-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPF</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center">Carregando...</td></tr>
            ) : customers?.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold mr-3">
                      {customer.name.charAt(0)}
                    </div>
                    <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.cpf}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.phone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {customer.addressCity ? `${customer.addressCity}/${customer.addressState}` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-primary-600 hover:text-primary-900 mr-3">Editar</button>
                  <button className="text-blue-600 hover:text-blue-900">Vender</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de Cadastro */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-gray-800">Cadastrar Novo Cliente</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <FiX size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input 
                    type="text" required
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                  <input 
                    type="text" required placeholder="000.000.000-00"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.cpf || ''}
                    onChange={e => setFormData({...formData, cpf: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input 
                    type="text" required placeholder="(00) 00000-0000"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.phone || ''}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input 
                    type="email"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                <div className="md:col-span-2 border-t pt-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center">
                    <FiMapPin className="mr-2" /> Endereço
                  </h4>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                  <input 
                    type="text" placeholder="00000-000"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.cep || ''}
                    onChange={e => setFormData({...formData, cep: e.target.value})}
                    onBlur={e => handleCepBlur(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rua/Logradouro</label>
                  <input 
                    type="text"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.addressStreet || ''}
                    onChange={e => setFormData({...formData, addressStreet: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                  <input 
                    type="text"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    value={formData.addressNeighborhood || ''}
                    onChange={e => setFormData({...formData, addressNeighborhood: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <input 
                      type="text"
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                      value={formData.addressCity || ''}
                      onChange={e => setFormData({...formData, addressCity: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                    <input 
                      type="text" maxLength={2}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                      value={formData.addressState || ''}
                      onChange={e => setFormData({...formData, addressState: e.target.value.toUpperCase()})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="btn-primary"
                >
                  {registerMutation.isPending ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
