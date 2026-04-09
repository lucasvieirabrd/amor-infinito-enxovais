import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import socket from '../../services/socket';
import {
  FiSearch, FiSend, FiCheck, FiCheckCircle, FiTag, FiX, FiPlus, FiTrash2
} from 'react-icons/fi';
import { Button, Card, Badge } from '../../components/ui';
import { formatInTimeZone } from 'date-fns-tz';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer {
  _id: string;
  name: string;
  phone: string;
}

interface Conversation {
  id: string;
  fromPhone: string;
  toPhone?: string;
  contactPhone?: string;
  lastMessage: string;
  lastMessageAt: string;
  customerName?: string;
  tag: string;           // legacy message tag
  conversationTag: string; // conversations table tag
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

// ─── Tag definitions ─────────────────────────────────────────────────────────

const TAGS = [
  { value: 'Pagamento',  label: 'Pagamento',  badge: 'success' as const },
  { value: 'Cobrança',   label: 'Cobrança',   badge: 'error'   as const },
  { value: 'Dúvida',     label: 'Dúvida',     badge: 'info'    as const },
  { value: 'Urgente',    label: 'Urgente',    badge: 'warning' as const },
  { value: 'Resolvido',  label: 'Resolvido',  badge: 'success' as const },
  { value: 'none',       label: 'Sem tag',    badge: 'info'    as const },
];

const tagBadge = (tag: string) => TAGS.find(t => t.value === tag)?.badge ?? 'info';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';

const parseDate = (val: any): Date | null => {
  if (!val) return null;
  // MySQL "YYYY-MM-DD HH:MM:SS" has no timezone — append Z to treat as UTC
  const str =
    typeof val === 'string'
      ? val.replace(' ', 'T') + (val.includes('T') || val.endsWith('Z') ? '' : 'Z')
      : val;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const formatTime = (val: any): string => {
  const d = parseDate(val);
  return d ? formatInTimeZone(d, TZ, 'HH:mm') : '';
};

// ─── Component ───────────────────────────────────────────────────────────────

export const Messages: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage]   = useState('');
  const [chatSearch, setChatSearch]   = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tag dropdown
  const [showTagMenu, setShowTagMenu] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Nova Conversa modal
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvSearch,    setNewConvSearch]    = useState('');
  const [newConvSelected,  setNewConvSelected]  = useState<Customer | null>(null);
  const [newConvMessage,   setNewConvMessage]   = useState('');

  // Close tag menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived contact phone ──────────────────────────────────────────────────
  // Prefer the pre-computed contactPhone from the backend; fall back to local logic
  const contactPhone = selectedConversation
    ? (selectedConversation.contactPhone ||
       (selectedConversation.fromPhone !== 'SISTEMA'
         ? selectedConversation.fromPhone
         : selectedConversation.toPhone))
    : undefined;

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: conversations, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await api.get('/messages/conversations');
      return res.data as Conversation[];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ['chat-history', contactPhone],
    queryFn: async () => {
      if (!contactPhone) return [];
      const res = await api.get(`/messages/history/${contactPhone}`);
      return res.data.data as Message[];
    },
    enabled: !!contactPhone,
  });

  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', newConvSearch],
    queryFn: async () => {
      if (!newConvSearch.trim()) return [];
      const res = await api.get('/customers', { params: { search: newConvSearch } });
      return res.data.data as Customer[];
    },
    enabled: !!newConvSearch.trim(),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (data: { to: string; content: string }) => api.post('/messages/send', data),
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-history', contactPhone] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

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

  const tagMutation = useMutation({
    mutationFn: ({ phone, tag }: { phone: string; tag: string }) =>
      api.put(`/messages/conversations/${encodeURIComponent(phone)}/tag`, { tag }),
    onSuccess: () => {
      setShowTagMenu(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Update selected conversation optimistically
      if (selectedConversation) {
        setSelectedConversation(prev => prev ? { ...prev, conversationTag: tagMutation.variables?.tag ?? prev.conversationTag } : prev);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (phone: string) =>
      api.delete(`/messages/conversations/${encodeURIComponent(phone)}`),
    onSuccess: () => {
      setSelectedConversation(null);
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────

  useEffect(() => {
    socket.connect();
    socket.on('new_message', () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('conversation_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => { socket.disconnect(); };
  }, [queryClient]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactPhone || !newMessage.trim()) return;
    sendMutation.mutate({ to: contactPhone, content: newMessage });
  };

  const handleTag = (tag: string) => {
    if (!contactPhone) return;
    tagMutation.mutate({ phone: contactPhone, tag });
  };

  const handleDelete = () => {
    if (!contactPhone) return;
    deleteMutation.mutate(contactPhone);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filteredConversations = (conversations ?? []).filter(conv => {
    const name  = (conv.customerName ?? '').toLowerCase();
    const phone = (conv.contactPhone ?? conv.fromPhone ?? '').toLowerCase();
    const q     = chatSearch.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const displayName = (conv: Conversation) =>
    conv.customerName ||
    conv.contactPhone ||
    (conv.fromPhone !== 'SISTEMA' ? conv.fromPhone : conv.toPhone) ||
    '—';

  const activeTag = (conv: Conversation) =>
    conv.conversationTag && conv.conversationTag !== 'none' ? conv.conversationTag : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mensagens</h1>
        <p className="text-gray-600 mt-1">Gerencie conversas com clientes via WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">

        {/* ── Conversation list ── */}
        <Card className="lg:col-span-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 space-y-2">
            <button
              onClick={() => setShowNewConvModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 px-3 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <FiPlus size={16} /> Nova Conversa
            </button>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar conversa..."
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                className="input-base pl-10 w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 p-4">
            {isLoadingConversations ? (
              <p className="text-center text-gray-500 py-8">Carregando conversas...</p>
            ) : filteredConversations.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Nenhuma conversa encontrada</p>
            ) : filteredConversations.map(conv => (
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
                    <p className="font-semibold text-gray-900 truncate">{displayName(conv)}</p>
                    <p className="text-xs text-gray-600 truncate">{conv.lastMessage || '—'}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatTime(conv.lastMessageAt)}</p>
                  </div>
                  {activeTag(conv) && (
                    <Badge variant={tagBadge(conv.conversationTag)} className="flex-shrink-0 text-xs">
                      {conv.conversationTag}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* ── Chat area ── */}
        {selectedConversation ? (
          <div className="lg:col-span-2 flex flex-col overflow-hidden">

            {/* Chat header */}
            <Card className="border-b border-gray-200 rounded-b-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{displayName(selectedConversation)}</h2>
                  <p className="text-sm text-gray-600">{contactPhone}</p>
                </div>

                <div className="flex items-center gap-2">

                  {/* Tag button */}
                  <div className="relative" ref={tagMenuRef}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowTagMenu(v => !v)}
                      className="flex items-center gap-2"
                    >
                      <FiTag size={16} />
                      {activeTag(selectedConversation)
                        ? <Badge variant={tagBadge(selectedConversation.conversationTag)} className="text-xs">{selectedConversation.conversationTag}</Badge>
                        : 'Tag'}
                    </Button>

                    {showTagMenu && (
                      <div className="absolute right-0 mt-2 w-44 bg-white rounded-lg shadow-xl border border-gray-200 z-20 py-1">
                        {TAGS.map(t => (
                          <button
                            key={t.value}
                            onClick={() => handleTag(t.value)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors ${
                              selectedConversation.conversationTag === t.value ? 'font-semibold' : ''
                            }`}
                          >
                            <Badge variant={t.badge} className="text-xs">{t.label}</Badge>
                            {selectedConversation.conversationTag === t.value && <span className="ml-auto text-primary">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-error hover:bg-error hover:text-white transition-colors"
                  >
                    <FiTrash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
              {messages?.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs px-4 py-2 rounded-lg ${
                    msg.direction === 'outbound'
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-1 text-xs ${
                      msg.direction === 'outbound' ? 'text-white text-opacity-70' : 'text-gray-500'
                    }`}>
                      <span>{formatTime(msg.timestamp)}</span>
                      {msg.direction === 'outbound' && (
                        msg.status === 'read'
                          ? <FiCheckCircle size={14} />
                          : <FiCheck size={14} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Message input */}
            <Card className="border-t border-gray-200 rounded-t-none">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma mensagem..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
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
            <p className="text-gray-500 text-lg">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

      {/* ── Nova Conversa modal ── */}
      {showNewConvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Nova Conversa</h2>
              <button onClick={() => { setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage(''); }}
                className="text-gray-400 hover:text-gray-600"><FiX size={20} /></button>
            </div>

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
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou telefone..."
                    value={newConvSearch}
                    onChange={e => setNewConvSearch(e.target.value)}
                    className="input-base pl-9 w-full"
                    autoFocus
                  />
                  {customerResults && customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customerResults.map(c => (
                        <button key={c._id} onClick={() => { setNewConvSelected(c); setNewConvSearch(''); }}
                          className="w-full text-left px-4 py-2 hover:bg-background transition-colors">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea
                placeholder="Digite a mensagem..."
                value={newConvMessage}
                onChange={e => setNewConvMessage(e.target.value)}
                rows={4}
                className="input-base w-full resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage(''); }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={newConvMutation.isPending}
                disabled={!newConvSelected || !newConvMessage.trim()}
                onClick={() => { if (newConvSelected && newConvMessage.trim()) newConvMutation.mutate({ to: newConvSelected.phone, content: newConvMessage.trim() }); }}
                className="flex items-center gap-2"
              >
                <FiSend size={16} /> Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && selectedConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Excluir conversa</h2>
            <p className="text-gray-600 text-sm">
              Tem certeza que deseja excluir a conversa com{' '}
              <span className="font-semibold">{displayName(selectedConversation)}</span>?
              Todas as mensagens serão removidas permanentemente.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={deleteMutation.isPending}
                onClick={handleDelete}
                className="bg-error hover:bg-error border-error flex items-center gap-2"
              >
                <FiTrash2 size={16} /> Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
