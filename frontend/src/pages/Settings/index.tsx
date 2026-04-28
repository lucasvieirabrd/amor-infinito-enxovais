import React, { useState, useEffect } from 'react';
import { FiSave, FiAlertCircle, FiKey, FiDatabase, FiMail, FiClock } from 'react-icons/fi';
import { Card, Button, Input, Badge } from '../../components/ui';
import api from '../../services/api';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'notifications'>('general');
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

  // Load PIX settings from backend on mount
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
      .catch(() => {
        // settings load failure is non-critical
      });
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
