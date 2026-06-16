import React, { useState, useEffect } from 'react';
import { FiSave, FiAlertCircle, FiKey, FiDatabase, FiMail, FiClock, FiUser, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX } from 'react-icons/fi';
import { Card, Button, Input, Badge } from '../../components/ui';
import api from '../../services/api';

interface Seller {
  id: string;
  name: string;
  active: boolean;
  deletedAt?: string | null;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications' | 'sellers'>('general');
  const [loading, setLoading] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pixSuccess, setPixSuccess] = useState(false);

  const [settings, setSettings] = useState({
    companyName: 'Amor Infinito Enxovais',
    companyEmail: 'contato@amorinfinito.com.br',
    companyPhone: '(11) 98765-4321',
    googleSheetId: import.meta.env.VITE_GOOGLE_SHEET_ID || '',
    googleServiceAccountJson: '***OCULTO***',
    notificationEmail: 'notificacoes@amorinfinito.com.br',
    enableWhatsAppNotifications: true,
    enableEmailNotifications: true,
    enableSMSNotifications: false,
    dueDateReminderDays: 1,
    overdueReminderDays: 5,
  });

  const [pixSettings, setPixSettings] = useState({
    pix_celita: '',
    pix_marcelo: '',
    pix_qrcode: '',
  });

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [newSellerName, setNewSellerName] = useState('');
  const [sellerLoading, setSellerLoading] = useState(false);
  const [editingSeller, setEditingSeller] = useState<{ id: string; name: string } | null>(null);

  const loadSellers = async () => {
    try {
      const res = await api.get('/sellers');
      setSellers(res.data);
    } catch {}
  };

  const handleAddSeller = async () => {
    if (!newSellerName.trim()) return;
    setSellerLoading(true);
    try {
      await api.post('/sellers', { name: newSellerName.trim() });
      setNewSellerName('');
      await loadSellers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao adicionar vendedor');
    } finally {
      setSellerLoading(false);
    }
  };

  const handleUpdateSeller = async () => {
    if (!editingSeller || !editingSeller.name.trim()) return;
    setSellerLoading(true);
    try {
      await api.put(`/sellers/${editingSeller.id}`, { name: editingSeller.name.trim() });
      setEditingSeller(null);
      await loadSellers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao atualizar vendedor');
    } finally {
      setSellerLoading(false);
    }
  };

  const handleToggleActive = async (seller: Seller) => {
    try {
      await api.put(`/sellers/${seller.id}`, { active: !seller.active });
      await loadSellers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao atualizar vendedor');
    }
  };

  const handleDeleteSeller = async (id: string) => {
    if (!confirm('Remover este vendedor?')) return;
    try {
      await api.delete(`/sellers/${id}`);
      await loadSellers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao remover vendedor');
    }
  };

  // Load PIX settings and sellers on mount
  useEffect(() => {
    api.get('/settings')
      .then(res => {
        const data = res.data as Record<string, string>;
        setPixSettings({
          pix_celita:  data.pix_celita  ?? '',
          pix_marcelo: data.pix_marcelo ?? '',
          pix_qrcode:  data.pix_qrcode  ?? '',
        });
      })
      .catch(() => {});
    loadSellers();
  }, []);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await api.post('/settings', settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePixSettings = async () => {
    setPixLoading(true);
    try {
      await api.patch('/settings', pixSettings);
      setPixSuccess(true);
      setTimeout(() => setPixSuccess(false), 3000);
    } catch (error: any) {
      console.error('Erro ao salvar configurações PIX:', error);
    } finally {
      setPixLoading(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePixChange = (key: keyof typeof pixSettings, value: string) => {
    setPixSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600 mt-1">Gerencie as configurações do sistema</p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-success bg-opacity-10 border border-success border-opacity-20 rounded-lg p-4 flex items-start gap-3">
          <FiAlertCircle className="text-success mt-1 flex-shrink-0" size={20} />
          <p className="text-sm text-success">Configurações salvas com sucesso!</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'general'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Geral
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'integrations'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Integrações
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'notifications'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Notificações
        </button>
        <button
          onClick={() => setActiveTab('sellers')}
          className={`px-4 py-3 font-medium border-b-2 transition-colors ${
            activeTab === 'sellers'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Vendedores
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <Card title="Informações da Empresa" subtitle="Dados gerais da sua empresa">
              <div className="space-y-4">
                <Input
                  label="Nome da Empresa"
                  value={settings.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                />
                <Input
                  label="E-mail da Empresa"
                  type="email"
                  value={settings.companyEmail}
                  onChange={(e) => handleChange('companyEmail', e.target.value)}
                />
                <Input
                  label="Telefone da Empresa"
                  value={settings.companyPhone}
                  onChange={(e) => handleChange('companyPhone', e.target.value)}
                />
              </div>
            </Card>

            {/* PIX Settings */}
            <Card title="Configurações PIX" subtitle="Chaves PIX exibidas no carnê e utilizadas para geração do QR Code">
              {pixSuccess && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <FiAlertCircle className="text-green-600 flex-shrink-0" size={16} />
                  <p className="text-sm text-green-700">Chaves PIX salvas com sucesso!</p>
                </div>
              )}
              <div className="space-y-4">
                <Input
                  label="PIX Celita (exibido no carnê)"
                  placeholder="Ex: 74480669604"
                  value={pixSettings.pix_celita}
                  onChange={(e) => handlePixChange('pix_celita', e.target.value)}
                />
                <Input
                  label="PIX Marcelo (exibido no carnê)"
                  placeholder="Ex: 16981271021"
                  value={pixSettings.pix_marcelo}
                  onChange={(e) => handlePixChange('pix_marcelo', e.target.value)}
                />
                <Input
                  label="PIX QR Code / Chave aleatória (usada para gerar o QR Code)"
                  placeholder="Ex: 5c17e289-963b-4f2b-af01-cd5c52f5af8e"
                  value={pixSettings.pix_qrcode}
                  onChange={(e) => handlePixChange('pix_qrcode', e.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    loading={pixLoading}
                    onClick={handleSavePixSettings}
                    className="flex items-center gap-2"
                  >
                    <FiSave size={16} />
                    Salvar Configurações PIX
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Integrations */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            <Card
              title="Google Sheets"
              subtitle="Sincronize seu estoque com Google Sheets"
              footer={
                <Badge variant="success">Conectado</Badge>
              }
            >
              <div className="space-y-4">
                <div className="bg-background p-4 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-3">
                    <FiDatabase className="text-primary mt-1 flex-shrink-0" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">ID da Planilha</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {settings.googleSheetId ? `${settings.googleSheetId.substring(0, 20)}...` : 'Não configurado'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-3">
                    <FiKey className="text-primary mt-1 flex-shrink-0" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Credenciais da Conta de Serviço</p>
                      <p className="text-xs text-gray-600 mt-1">Arquivo JSON está seguro no servidor</p>
                    </div>
                  </div>
                </div>
                <Button variant="secondary" size="lg" className="w-full">
                  Reconectar Google Sheets
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <Card title="Canais de Notificação" subtitle="Configure como você deseja ser notificado">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <FiMail className="text-primary" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Notificações por E-mail</p>
                      <p className="text-xs text-gray-600">Receba alertas por e-mail</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableEmailNotifications}
                    onChange={(e) => handleChange('enableEmailNotifications', e.target.checked)}
                    className="w-5 h-5 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <FiMail className="text-primary" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Notificações por WhatsApp</p>
                      <p className="text-xs text-gray-600">Receba alertas via WhatsApp</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableWhatsAppNotifications}
                    onChange={(e) => handleChange('enableWhatsAppNotifications', e.target.checked)}
                    className="w-5 h-5 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <FiMail className="text-primary" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Notificações por SMS</p>
                      <p className="text-xs text-gray-600">Receba alertas por SMS</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableSMSNotifications}
                    onChange={(e) => handleChange('enableSMSNotifications', e.target.checked)}
                    className="w-5 h-5 rounded cursor-pointer"
                  />
                </div>
              </div>
            </Card>

            <Card title="Lembretes de Vencimento" subtitle="Configure quando você deseja ser notificado">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-background rounded-lg border border-gray-200">
                  <FiClock className="text-primary flex-shrink-0" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Lembrete no dia do vencimento</p>
                    <p className="text-xs text-gray-600">Você será notificado no dia que a parcela vencer</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-background rounded-lg border border-gray-200">
                  <FiClock className="text-primary flex-shrink-0" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Cobrança após vencimento</p>
                    <Input
                      label="Dias após vencimento"
                      type="number"
                      value={settings.overdueReminderDays}
                      onChange={(e) => handleChange('overdueReminderDays', parseInt(e.target.value))}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Sellers */}
        {activeTab === 'sellers' && (
          <div className="space-y-6">
            <Card title="Vendedores" subtitle="Gerencie os vendedores cadastrados no sistema">
              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Nome do vendedor..."
                  value={newSellerName}
                  onChange={e => setNewSellerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddSeller()}
                  className="flex-1 h-[44px] px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary focus:ring-opacity-20 transition-colors"
                />
                <Button
                  variant="primary"
                  onClick={handleAddSeller}
                  loading={sellerLoading}
                  disabled={!newSellerName.trim()}
                  className="flex items-center gap-2"
                >
                  <FiPlus size={16} />
                  Adicionar
                </Button>
              </div>

              {sellers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FiUser size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum vendedor cadastrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sellers.map(seller => (
                    <div key={seller.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-gray-100">
                      {editingSeller?.id === seller.id ? (
                        <input
                          type="text"
                          value={editingSeller.name}
                          onChange={e => setEditingSeller({ ...editingSeller, name: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && handleUpdateSeller()}
                          className="flex-1 h-9 px-3 border border-primary rounded-lg text-sm focus:outline-none mr-3"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-primary bg-opacity-10 flex items-center justify-center">
                            <FiUser size={14} className="text-primary" />
                          </div>
                          <span className={`font-medium text-sm ${!seller.active ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {seller.name}
                          </span>
                          {!seller.active && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inativo</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {editingSeller?.id === seller.id ? (
                          <>
                            <button onClick={handleUpdateSeller} disabled={sellerLoading} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Salvar">
                              <FiCheck size={16} />
                            </button>
                            <button onClick={() => setEditingSeller(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Cancelar">
                              <FiX size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleActive(seller)}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${seller.active ? 'border-gray-200 text-gray-600 hover:bg-gray-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                            >
                              {seller.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button onClick={() => setEditingSeller({ id: seller.id, name: seller.name })} className="p-2 text-primary hover:bg-primary hover:bg-opacity-10 rounded-lg transition-colors">
                              <FiEdit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteSeller(seller.id)} className="p-2 text-error hover:bg-error hover:bg-opacity-10 rounded-lg transition-colors">
                              <FiTrash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Save Button (general settings) */}
      <div className="flex justify-end gap-3">
        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onClick={handleSaveSettings}
          className="flex items-center gap-2"
        >
          <FiSave size={20} />
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
};
