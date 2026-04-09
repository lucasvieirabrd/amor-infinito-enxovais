import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import socket from '../../services/socket';
import {
  FiSearch, FiSend, FiCheck, FiCheckCircle, FiTag, FiX, FiPlus
} from 'react-icons/fi';
import { Button, Card, Badge, Input } from '../../components/ui';
import { format } from 'date-fns';

interface Customer {
  _id: string;
  name: string;
  phone: string;
}

interface Conversation {
  id: string;
  fromPhone: string;
  toPhone?: string;
  lastMessage: string;
  lastMessageAt: string;
  customerName?: string;
  tag: 'cobrança' | 'lead' | 'suporte' | 'none';
  notes?: string;
}

interface Message {
  id: string;
  fromPhone: string;
  toPhone: string;
  content: string;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'received';
  timestamp: string;
}

const tagColors: Record<string, { bg: string; text: string; label: string }> = {
  'cobrança': { bg: 'bg-error', text: 'text-white', label: 'Cobrança' },
  'lead': { bg: 'bg-primary', text: 'text-white', label: 'Lead' },
  'suporte': { bg: 'bg-warning', text: 'text-white', label: 'Suporte' },
  'none': { bg: 'bg-gray-200', text: 'text-gray-700', label: 'Sem Tag' },
};

const parseDate = (val: any): Date | null => {
  if (!val) return null;
  // Handle MySQL "YYYY-MM-DD HH:MM:SS" format (not valid ISO)
  const str = typeof val === 'string' ? val.replace(' ', 'T') : val;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export const Messages: React.FC = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Nova Conversa modal state
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvSearch, setNewConvSearch] = useState('');
  const [newConvSelected, setNewConvSelected] = useState<Customer | null>(null);
  const [newConvMessage, setNewConvMessage] = useState('');

  // Listar conversas
  const { data: conversations, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await api.get('/messages/conversations');
      return response.data as Conversation[];
    },
  });

  // Buscar histórico de chat
  const { data: messages } = useQuery({
    queryKey: ['chat-history', selectedConversation?.fromPhone],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const response = await api.get(`/messages/history/${selectedConversation.fromPhone}`);
      return response.data.data as Message[];
    },
    enabled: !!selectedConversation,
  });

  // Mutação para enviar mensagem
  const sendMutation = useMutation({
    mutationFn: (data: { to: string, content: string }) => api.post('/messages/send', data),
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-history', selectedConversation?.fromPhone] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Buscar clientes para nova conversa
  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', newConvSearch],
    queryFn: async () => {
      if (!newConvSearch.trim()) return [];
      const response = await api.get('/customers', { params: { search: newConvSearch } });
      return response.data.data as Customer[];
    },
    enabled: !!newConvSearch.trim(),
  });

  // Mutação para enviar nova conversa
  const newConvMutation = useMutation({
    mutationFn: (data: { to: string; content: string }) => api.post('/messages/send', data),
    onSuccess: () => {
      setShowNewConvModal(false);
      setNewConvSearch('');
      setNewConvSelected(null);
      setNewConvMessage('');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Mutação para atualizar CRM (Tag)
  const updateCRMMutation = useMutation({
    mutationFn: (data: { id: string, tag: string }) => api.patch(`/messages/${data.id}/crm`, { tag: data.tag }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedTag(null);
    },
  });

  // WebSocket: Receber novas mensagens em tempo real
  useEffect(() => {
    socket.connect();
    
    socket.on('new_message', (message: any) => {
      queryClient.invalidateQueries({ queryKey: ['chat-history'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on('conversation_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !newMessage.trim()) return;

    sendMutation.mutate({
      to: selectedConversation.fromPhone,
      content: newMessage,
    });
  };

  const handleUpdateTag = (tag: string) => {
    if (selectedConversation) {
      updateCRMMutation.mutate({
        id: selectedConversation.id,
        tag,
      });
    }
  };

  const filteredConversations = conversations?.filter(conv => {
    const customerName = conv.customerName || '';
    const phone = conv.fromPhone || '';
    const searchLower = chatSearch.toLowerCase();
    return (
      customerName.toLowerCase().includes(searchLower) ||
      phone.includes(searchLower)
    );
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mensagens</h1>
        <p className="text-gray-600 mt-1">Gerencie conversas com clientes via WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 space-y-2">
            <button
              onClick={() => setShowNewConvModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 px-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <FiPlus size={16} />
              Nova Conversa
            </button>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar conversa..."
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                className="input-base pl-10 w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 p-4">
            {isLoadingConversations ? (
              <div className="text-center text-gray-500 py-8">Carregando conversas...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center text-gray-500 py-8">Nenhuma conversa encontrada</div>
            ) : (
              filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedConversation?.id === conv.id
                      ? 'bg-primary bg-opacity-10 border-primary'
                      : 'border-gray-200 hover:border-primary hover:bg-background'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {conv.customerName || (conv.fromPhone !== 'SISTEMA' ? conv.fromPhone : conv.toPhone) || '—'}
                      </p>
                      <p className="text-xs text-gray-600 truncate">{conv.lastMessage || '—'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(() => {
                          const date = parseDate(conv.lastMessageAt);
                          return date ? format(date, 'HH:mm') : '';
                        })()}
                      </p>
                    </div>
                    {conv.tag !== 'none' && (() => {
                      let badgeVariant: 'success' | 'error' | 'warning' | 'info' = 'info';
                      if (conv.tag === 'cobrança') badgeVariant = 'error';
                      else if (conv.tag === 'lead') badgeVariant = 'info';
                      else if (conv.tag === 'suporte') badgeVariant = 'warning';
                      
                      return (
                        <Badge variant={badgeVariant} className="flex-shrink-0">
                          {tagColors[conv.tag]?.label || conv.tag}
                        </Badge>
                      );
                    })()}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Chat Area */}
        {selectedConversation ? (
          <div className="lg:col-span-2 flex flex-col overflow-hidden">
            {/* Chat Header */}
            <Card className="border-b border-gray-200 rounded-b-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedConversation.customerName || (selectedConversation.fromPhone !== 'SISTEMA' ? selectedConversation.fromPhone : selectedConversation.toPhone) || '—'}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selectedConversation.fromPhone !== 'SISTEMA' ? selectedConversation.fromPhone : selectedConversation.toPhone}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <FiTag size={16} />
                      Tag
                    </Button>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 hidden group-hover:block z-10">
                      {(Object.entries(tagColors) || []).map(([key, value]) => {
                        let badgeVariant: 'success' | 'error' | 'warning' | 'info' = 'info';
                        if (key === 'cobrança') badgeVariant = 'error';
                        else if (key === 'lead') badgeVariant = 'info';
                        else if (key === 'suporte') badgeVariant = 'warning';
                        
                        return (
                          <button
                            key={key}
                            onClick={() => handleUpdateTag(key)}
                            className="w-full text-left px-4 py-2 hover:bg-background transition-colors first:rounded-t-lg last:rounded-b-lg"
                          >
                            <Badge variant={badgeVariant}>
                              {value?.label || key}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.direction === 'outbound'
                        ? 'bg-primary text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-1 text-xs ${
                      msg.direction === 'outbound' ? 'text-white text-opacity-70' : 'text-gray-500'
                    }`}>
                      <span>
                        {(() => {
                          const date = parseDate(msg.timestamp);
                          return date ? format(date, 'HH:mm') : '';
                        })()}
                      </span>
                      {msg.direction === 'outbound' && (
                        msg.status === 'read' ? (
                          <FiCheckCircle size={14} />
                        ) : (
                          <FiCheck size={14} />
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input */}
            <Card className="border-t border-gray-200 rounded-t-none">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="input-base flex-1"
                />
                <Button
                  variant="primary"
                  type="submit"
                  loading={sendMutation.isPending}
                  disabled={!newMessage.trim()}
                  className="flex items-center gap-2"
                >
                  <FiSend size={18} />
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center bg-background rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center">
              <p className="text-gray-500 text-lg">Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
      {/* Modal Nova Conversa */}
      {showNewConvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Nova Conversa</h2>
              <button
                onClick={() => { setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Busca de cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              {newConvSelected ? (
                <div className="flex items-center justify-between p-3 border border-primary rounded-lg bg-primary bg-opacity-5">
                  <div>
                    <p className="font-medium text-gray-900">{newConvSelected.name}</p>
                    <p className="text-sm text-gray-500">{newConvSelected.phone}</p>
                  </div>
                  <button onClick={() => setNewConvSelected(null)} className="text-gray-400 hover:text-gray-600">
                    <FiX size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou telefone..."
                    value={newConvSearch}
                    onChange={(e) => setNewConvSearch(e.target.value)}
                    className="input-base pl-9 w-full"
                    autoFocus
                  />
                  {customerResults && customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customerResults.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => { setNewConvSelected(c); setNewConvSearch(''); }}
                          className="w-full text-left px-4 py-2 hover:bg-background transition-colors"
                        >
                          <p className="font-medium text-gray-900">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {newConvSearch.trim() && customerResults?.length === 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-500">
                      Nenhum cliente encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mensagem */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea
                placeholder="Digite a mensagem..."
                value={newConvMessage}
                onChange={(e) => setNewConvMessage(e.target.value)}
                rows={4}
                className="input-base w-full resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => { setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage(''); }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={newConvMutation.isPending}
                disabled={!newConvSelected || !newConvMessage.trim()}
                onClick={() => {
                  if (newConvSelected && newConvMessage.trim()) {
                    newConvMutation.mutate({ to: newConvSelected.phone, content: newConvMessage.trim() });
                  }
                }}
                className="flex items-center gap-2"
              >
                <FiSend size={16} />
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
