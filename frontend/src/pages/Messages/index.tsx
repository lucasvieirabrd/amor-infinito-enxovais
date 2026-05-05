import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import socket from '../../services/socket';
import {
  FiSearch, FiSend, FiCheck, FiCheckCircle, FiTag, FiX, FiPlus, FiTrash2,
  FiMessageSquare, FiArrowUp, FiArrowDown, FiList, FiGrid,
  FiFile, FiDownload, FiVolume2, FiVideo, FiImage,
} from 'react-icons/fi';
import { Button, Badge } from '../../components/ui';
import { formatInTimeZone } from 'date-fns-tz';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer { _id: string; name: string; phone: string; }

interface Conversation {
  id: string;
  fromPhone: string;
  toPhone?: string;
  contactPhone?: string;
  lastMessage: string;
  lastMessageAt: string;
  customerName?: string;
  tag: string;
  conversationTag: string;
  notes?: string;
}

interface Message {
  id: string;
  fromPhone: string;
  toPhone: string;
  type?: string;
  content: string | null;
  mediaId?: string | null;
  mediaFilename?: string | null;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'received';
  timestamp: string;
}

interface StatsToday {
  outboundToday: number;
  inboundToday: number;
  inboundByTag: Record<string, number>;
}

type ViewMode = 'list' | 'kanban';

// ─── Tag definitions ─────────────────────────────────────────────────────────

const TAGS = [
  { value: 'Cobrança',  label: 'Cobrança',  badge: 'error'   as const, color: 'bg-red-100 text-red-800'      },
  { value: 'Venda',     label: 'Venda',     badge: 'success' as const, color: 'bg-green-100 text-green-800'  },
  { value: 'Follow',    label: 'Follow',    badge: 'info'    as const, color: 'bg-blue-100 text-blue-800'    },
  { value: 'Anúncios',  label: 'Anúncios',  badge: 'info'    as const, color: 'bg-purple-100 text-purple-800' },
  { value: 'none',      label: 'Sem Tag',   badge: 'default' as const, color: 'bg-gray-100 text-gray-500'    },
];

// ─── Kanban column definitions ────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { value: 'Cobrança', label: 'Cobrança', color: 'bg-red-100 text-red-700',    header: 'bg-red-50 border-red-200'    },
  { value: 'Venda',    label: 'Venda',    color: 'bg-green-100 text-green-700', header: 'bg-green-50 border-green-200' },
  { value: 'Follow',   label: 'Follow',   color: 'bg-blue-100 text-blue-700',   header: 'bg-blue-50 border-blue-200'  },
  { value: 'Anúncios', label: 'Anúncios', color: 'bg-purple-100 text-purple-700',header: 'bg-purple-50 border-purple-200'},
  { value: 'none',     label: 'Sem Tag',  color: 'bg-gray-100 text-gray-500',   header: 'bg-gray-50 border-gray-200'  },
];

const TAB_ALL = 'Todas';
const TABS = [TAB_ALL, ...TAGS.map(t => t.label)];

const tagBadge  = (tag: string) => TAGS.find(t => t.value === tag || t.label === tag)?.badge ?? 'info';
const tagColor  = (tag: string) => TAGS.find(t => t.value === tag || t.label === tag)?.color ?? 'bg-gray-100 text-gray-500';

const kanbanColor = (tag: string) =>
  KANBAN_COLUMNS.find(c => c.value === tag)?.color ?? tagColor(tag);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';

const parseDate = (val: any): Date | null => {
  if (!val) return null;
  const str =
    typeof val === 'string'
      ? val.replace(' ', 'T') + (val.includes('T') || val.endsWith('Z') ? '' : 'Z')
      : val;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const formatRelativeTime = (val: any): string => {
  const d = parseDate(val);
  if (!d) return '';
  const timeStr = formatInTimeZone(d, TZ, 'HH:mm');
  const today = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const yesterday = formatInTimeZone(new Date(Date.now() - 86_400_000), TZ, 'yyyy-MM-dd');
  const msgDay = formatInTimeZone(d, TZ, 'yyyy-MM-dd');
  if (msgDay === today) return timeStr;
  if (msgDay === yesterday) return `Ontem ${timeStr}`;
  return `${formatInTimeZone(d, TZ, 'dd/MM')} ${timeStr}`;
};

// ─── Media URL hook ───────────────────────────────────────────────────────────
// Fetches media from the authenticated proxy endpoint and returns a revokable blob URL.

type MediaState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' };

function useMediaUrl(mediaId: string | null | undefined): MediaState {
  const [state, setState] = useState<MediaState>({ status: 'idle' });

  useEffect(() => {
    if (!mediaId) { setState({ status: 'idle' }); return; }
    setState({ status: 'loading' });
    let objectUrl: string | null = null;
    api.get(`/messages/media/${mediaId}`, { responseType: 'blob' })
      .then(res => {
        objectUrl = URL.createObjectURL(res.data);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch(() => setState({ status: 'error' }));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId]);

  return state;
}

// ─── Per-type media bubble ────────────────────────────────────────────────────

const MediaBubble: React.FC<{
  msg: Message;
  isOutbound: boolean;
  onImageClick: (src: string) => void;
}> = ({ msg, isOutbound, onImageClick }) => {
  const media = useMediaUrl(msg.mediaId);
  const dimBg = isOutbound ? 'bg-white bg-opacity-20' : 'bg-gray-100';
  const subText = isOutbound ? 'text-white opacity-75' : 'text-gray-500';

  const url = media.status === 'ready' ? media.url : null;
  const unavailable = !msg.mediaId || media.status === 'error';
  const loading = media.status === 'loading';

  const UnavailableLabel = () => (
    <p className={`text-xs italic ${subText}`}>
      {media.status === 'error' ? '⚠ Erro ao carregar mídia' : '⚠ Mídia indisponível'}
    </p>
  );

  if (msg.type === 'image' || msg.type === 'sticker') {
    const cls = msg.type === 'sticker' ? 'w-24 h-24' : 'w-52 h-40';
    return (
      <div className="space-y-1">
        {url ? (
          <img src={url} alt={msg.type === 'sticker' ? 'Sticker' : 'Imagem'}
            onClick={() => onImageClick(url)}
            className={`${cls} object-cover rounded-xl cursor-zoom-in hover:opacity-90 transition-opacity`} />
        ) : unavailable ? (
          <div className={`${cls} rounded-xl ${dimBg} flex flex-col items-center justify-center gap-1`}>
            <FiImage size={24} className="opacity-30" />
            <UnavailableLabel />
          </div>
        ) : (
          <div className={`${cls} rounded-xl ${dimBg} flex items-center justify-center`}>
            <FiImage size={24} className="opacity-30 animate-pulse" />
          </div>
        )}
        {msg.content && <p className="text-sm">{msg.content}</p>}
      </div>
    );
  }

  if (msg.type === 'audio') {
    return (
      <div className="flex items-center gap-2 min-w-[200px]">
        <FiVolume2 size={18} className="flex-shrink-0 opacity-70" />
        {url
          ? <audio controls src={url} className="h-8 flex-1"
              style={{ filter: isOutbound ? 'invert(1) brightness(1.8)' : 'none' }} />
          : unavailable
            ? <UnavailableLabel />
            : <p className="text-sm italic opacity-60">Carregando áudio…</p>
        }
      </div>
    );
  }

  if (msg.type === 'video') {
    return (
      <div className="space-y-1">
        {url
          ? <video controls src={url} className="w-56 max-h-44 rounded-xl object-cover" />
          : unavailable
            ? <div className="w-56 h-20 rounded-xl flex flex-col items-center justify-center gap-1 bg-black bg-opacity-10">
                <FiVideo size={24} className="opacity-30" />
                <UnavailableLabel />
              </div>
            : <div className="w-56 h-36 rounded-xl flex items-center justify-center bg-black bg-opacity-10">
                <FiVideo size={28} className="opacity-30 animate-pulse" />
              </div>
        }
        {msg.content && <p className="text-sm">{msg.content}</p>}
      </div>
    );
  }

  if (msg.type === 'document') {
    return (
      <div className="flex items-center gap-3 min-w-[220px] max-w-xs">
        <div className={`flex-shrink-0 p-2 rounded-lg ${dimBg}`}>
          <FiFile size={22} className="opacity-80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{msg.mediaFilename || 'Documento'}</p>
          {unavailable
            ? <UnavailableLabel />
            : loading
              ? <p className={`text-xs mt-0.5 ${subText} italic`}>Carregando…</p>
              : msg.content
                ? <p className={`text-xs mt-0.5 ${subText}`}>{msg.content}</p>
                : null
          }
        </div>
        {url && (
          <a href={url} download={msg.mediaFilename || 'documento'}
            onClick={e => e.stopPropagation()}
            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${isOutbound ? 'hover:bg-white hover:bg-opacity-20' : 'hover:bg-gray-100'}`}>
            <FiDownload size={18} className="opacity-80" />
          </a>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm italic opacity-70">📎 Mídia não suportada ({msg.type})</p>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Messages: React.FC = () => {
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('messages-view-mode') as ViewMode) ?? 'list'
  );
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage,    setNewMessage]    = useState('');
  const [chatSearch,    setChatSearch]    = useState('');
  const [activeTab,     setActiveTab]     = useState(TAB_ALL);
  const [showTagMenu,   setShowTagMenu]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewConvModal,  setShowNewConvModal]  = useState(false);
  const [newConvSearch,    setNewConvSearch]    = useState('');
  const [newConvSelected,  setNewConvSelected]  = useState<Customer | null>(null);
  const [newConvMessage,   setNewConvMessage]   = useState('');

  // Kanban DnD state
  const [dragConv,    setDragConv]    = useState<Conversation | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('messages-view-mode', mode);
    setSelectedConversation(null);
  };

  // Close tag menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node))
        setShowTagMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Contact phone ───────────────────────────────────────────────────────────
  const contactPhone = selectedConversation
    ? (selectedConversation.contactPhone ||
       (selectedConversation.fromPhone !== 'SISTEMA'
         ? selectedConversation.fromPhone
         : selectedConversation.toPhone))
    : undefined;

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await api.get('/messages/conversations');
      return res.data as Conversation[];
    },
  });

  const { data: stats } = useQuery<StatsToday>({
    queryKey: ['messages-stats-today'],
    queryFn: async () => {
      const res = await api.get('/messages/stats/today');
      return res.data;
    },
    refetchInterval: 60_000,
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

  // ── Mutations ───────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (data: { to: string; content: string }) => api.post('/messages/send', data),
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-history', contactPhone] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats-today'] });
    },
  });

  const newConvMutation = useMutation({
    mutationFn: (data: { to: string; content: string }) => api.post('/messages/send', data),
    onSuccess: () => {
      setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage('');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats-today'] });
    },
  });

  const tagMutation = useMutation({
    mutationFn: ({ phone, tag }: { phone: string; tag: string }) =>
      api.put(`/messages/conversations/${encodeURIComponent(phone)}/tag`, { tag }),
    onSuccess: (_, vars) => {
      setShowTagMenu(false);
      setSelectedConversation(prev => prev ? { ...prev, conversationTag: vars.tag } : prev);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (phone: string) =>
      api.delete(`/messages/conversations/${encodeURIComponent(phone)}`),
    onSuccess: () => {
      setSelectedConversation(null); setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // ── WebSocket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    socket.connect();
    socket.on('new_message', () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats-today'] });
    });
    socket.on('conversation_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => { socket.disconnect(); };
  }, [queryClient]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSend = (e: React.FormEvent) => {
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

  // ── Kanban DnD handlers ───────────────────────────────────────────────────

  const handleDragStart = (conv: Conversation) => setDragConv(conv);

  const handleDragOver = (e: React.DragEvent, colValue: string) => {
    e.preventDefault();
    setDragOverCol(colValue);
  };

  const handleDrop = (colValue: string) => {
    if (dragConv && dragConv.conversationTag !== colValue) {
      const phone = dragConv.contactPhone || dragConv.fromPhone;
      tagMutation.mutate({ phone, tag: colValue });
    }
    setDragConv(null);
    setDragOverCol(null);
  };

  const handleDragEnd = () => {
    setDragConv(null);
    setDragOverCol(null);
  };

  // ── Filtered conversations (list mode) ──────────────────────────────────

  const filtered = (conversations ?? []).filter(conv => {
    const name  = (conv.customerName ?? '').toLowerCase();
    const phone = (conv.contactPhone ?? conv.fromPhone ?? '').toLowerCase();
    const q     = chatSearch.toLowerCase();
    const matchSearch = name.includes(q) || phone.includes(q);
    if (!matchSearch) return false;
    if (activeTab === TAB_ALL) return true;
    if (activeTab === 'Sem tag') return !conv.conversationTag || conv.conversationTag === 'none';
    return conv.conversationTag === activeTab;
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const displayName = (conv: Conversation) =>
    conv.customerName ||
    conv.contactPhone ||
    (conv.fromPhone !== 'SISTEMA' ? conv.fromPhone : conv.toPhone) ||
    '—';

  const activeTag = (conv: Conversation) =>
    conv.conversationTag && conv.conversationTag !== 'none' ? conv.conversationTag : null;

  const convPhone = (conv: Conversation) =>
    conv.contactPhone || (conv.fromPhone !== 'SISTEMA' ? conv.fromPhone : conv.toPhone) || '';

  // ── Chat panel (shared between list right-panel and kanban modal) ────────

  const ChatPanel = ({ onClose }: { onClose?: () => void }) => (
    <>
      {/* Chat header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">{selectedConversation ? displayName(selectedConversation) : ''}</h2>
          <p className="text-xs text-gray-500">{contactPhone}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tag button */}
          <div className="relative" ref={tagMenuRef}>
            <Button variant="secondary" size="sm"
              onClick={() => setShowTagMenu(v => !v)}
              className="flex items-center gap-1.5 text-sm"
            >
              <FiTag size={14} />
              {selectedConversation && activeTag(selectedConversation)
                ? <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(selectedConversation.conversationTag)}`}>{selectedConversation.conversationTag}</span>
                : 'Tag'
              }
            </Button>
            {showTagMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-gray-200 z-20 py-1">
                {TAGS.map(t => (
                  <button key={t.value}
                    onClick={() => handleTag(t.value)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between transition-colors"
                  >
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>
                    {selectedConversation?.conversationTag === t.value && <span className="text-primary text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete button */}
          <Button variant="secondary" size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-500 hover:bg-red-50 border-red-200"
          >
            <FiTrash2 size={15} />
          </Button>

          {/* Close button (kanban modal only) */}
          {onClose && (
            <button onClick={onClose} className="ml-1 text-gray-400 hover:text-gray-600 transition-colors">
              <FiX size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {!messages || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <FiMessageSquare size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma mensagem ainda</p>
            </div>
          </div>
        ) : messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-sm px-4 py-2 rounded-2xl ${
              msg.direction === 'outbound'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
            }`}>
              {(!msg.type || msg.type === 'text' || msg.type === 'template') ? (
                <p className="text-sm">{msg.content}</p>
              ) : (msg.type === 'unsupported' || msg.type === 'unknown') ? (
                <p className="text-sm italic opacity-70">📎 Mídia não suportada</p>
              ) : (
                <MediaBubble msg={msg} isOutbound={msg.direction === 'outbound'} onImageClick={setLightboxSrc} />
              )}
              <div className={`flex items-center gap-1 mt-1 text-xs ${
                msg.direction === 'outbound' ? 'text-white opacity-70 justify-end' : 'text-gray-400'
              }`}>
                <span>{formatRelativeTime(msg.timestamp)}</span>
                {msg.direction === 'outbound' && (
                  msg.status === 'read' ? <FiCheckCircle size={12} /> : <FiCheck size={12} />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 p-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            placeholder="Digite uma mensagem..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            className="input-base flex-1 text-sm"
          />
          <Button variant="primary" type="submit"
            loading={sendMutation.isPending} disabled={!newMessage.trim()}
            className="flex items-center gap-1.5"
          >
            <FiSend size={16} />
          </Button>
        </form>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-80px)] space-y-4 overflow-hidden">

      {/* ── Page header + stats bar ── */}
      <div className="flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mensagens</h1>
          <p className="text-gray-600 mt-1">Gerencie conversas com clientes via WhatsApp</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          {/* Stats today */}
          {stats && (
            <>
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <FiArrowUp size={14} className="text-green-600" />
                <span className="font-semibold text-green-700">{stats.outboundToday}</span>
                <span className="text-green-600">enviadas hoje</span>
              </div>
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                <FiArrowDown size={14} className="text-blue-600" />
                <span className="font-semibold text-blue-700">{stats.inboundToday}</span>
                <span className="text-blue-600">recebidas hoje</span>
              </div>
            </>
          )}

          {/* View toggle */}
          <div className="flex items-center bg-white border border-gray-300 rounded-lg p-1 gap-0.5 shadow-sm">
            <button
              onClick={() => switchView('list')}
              title="Modo lista"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <FiList size={14} />
              Lista
            </button>
            <button
              onClick={() => switchView('kanban')}
              title="Modo kanban"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <FiGrid size={14} />
              Kanban
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── LIST MODE ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <div className="flex gap-6 flex-1 min-h-0">

          {/* ── Left panel: list ── */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Search + new button */}
            <div className="flex-shrink-0 p-3 border-b border-gray-200 space-y-2">
              <button
                onClick={() => setShowNewConvModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 px-3 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <FiPlus size={15} /> Nova Conversa
              </button>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  className="input-base pl-9 w-full text-sm"
                />
              </div>
            </div>

            {/* ── Tag tabs ── */}
            <div className="flex-shrink-0 flex gap-0 overflow-x-auto border-b border-gray-200 bg-gray-50">
              {TABS.map(tab => {
                const tagVal = TAGS.find(t => t.label === tab)?.value ?? 'none';
                const count  = tab !== TAB_ALL && stats?.inboundByTag
                  ? (stats.inboundByTag[tagVal] ?? 0)
                  : 0;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-primary text-primary bg-white'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {tab}
                    {count > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Conversation list (scrollable) ── */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="text-center text-gray-500 py-8 text-sm">Carregando...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">Nenhuma conversa encontrada</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filtered.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selectedConversation?.id === conv.id
                          ? 'bg-primary bg-opacity-10'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">{displayName(conv)}</p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessage || '—'}</p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          <span className="text-xs text-gray-400">{formatRelativeTime(conv.lastMessageAt)}</span>
                          {activeTag(conv) && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(conv.conversationTag)}`}>
                              {conv.conversationTag}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: chat ── */}
          {selectedConversation ? (
            <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <ChatPanel />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center text-gray-400">
                <FiMessageSquare size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">Selecione uma conversa</p>
                <p className="text-sm mt-1">ou inicie uma nova</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── KANBAN MODE ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'kanban' && (
        <div className="flex-1 min-h-0 flex gap-6 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map(col => {
            const colConvs = (conversations ?? []).filter(c => {
              const tag = c.conversationTag || 'none';
              return col.value === 'none' ? tag === 'none' : tag === col.value;
            });
            const isOver = dragOverCol === col.value;

            return (
              <div
                key={col.value}
                className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border-2 transition-colors ${
                  isOver ? 'border-primary bg-primary bg-opacity-5' : `border ${col.header}`
                }`}
                style={{ minHeight: '520px' }}
                onDragOver={e => handleDragOver(e, col.value)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.value)}
              >
                {/* Column header */}
                <div className={`flex-shrink-0 flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b ${col.header}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs font-bold text-gray-500 bg-white rounded-full px-2 py-0.5 border border-gray-200">
                    {colConvs.length}
                  </span>
                </div>

                {/* Cards (scrollable) */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {colConvs.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-6">Nenhuma conversa</p>
                  ) : colConvs.map(conv => (
                    <div
                      key={conv.id}
                      draggable
                      onDragStart={() => handleDragStart(conv)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedConversation(conv)}
                      className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md hover:border-primary transition-all select-none"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="font-medium text-gray-900 text-sm truncate flex-1">{displayName(conv)}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatRelativeTime(conv.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-2">{conv.lastMessage || '—'}</p>
                      {conv.conversationTag && conv.conversationTag !== 'none' && (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${kanbanColor(conv.conversationTag)}`}>
                          {conv.conversationTag}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Kanban chat modal ── */}
      {viewMode === 'kanban' && selectedConversation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
            <ChatPanel onClose={() => { setSelectedConversation(null); setShowTagMenu(false); }} />
          </div>
        </div>
      )}

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
                  <button onClick={() => setNewConvSelected(null)} className="text-gray-400 hover:text-gray-600"><FiX size={16} /></button>
                </div>
              ) : (
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" placeholder="Buscar por nome ou telefone..."
                    value={newConvSearch} onChange={e => setNewConvSearch(e.target.value)}
                    className="input-base pl-9 w-full" autoFocus />
                  {customerResults && customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {customerResults.map(c => (
                        <button key={c._id} onClick={() => { setNewConvSelected(c); setNewConvSearch(''); }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors">
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
              <textarea placeholder="Digite a mensagem..." value={newConvMessage}
                onChange={e => setNewConvMessage(e.target.value)}
                rows={4} className="input-base w-full resize-none" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setShowNewConvModal(false); setNewConvSearch(''); setNewConvSelected(null); setNewConvMessage(''); }}>
                Cancelar
              </Button>
              <Button variant="primary" loading={newConvMutation.isPending}
                disabled={!newConvSelected || !newConvMessage.trim()}
                onClick={() => { if (newConvSelected && newConvMessage.trim()) newConvMutation.mutate({ to: newConvSelected.phone, content: newConvMessage.trim() }); }}
                className="flex items-center gap-2">
                <FiSend size={16} /> Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image lightbox ── */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-90 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="Imagem ampliada"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
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
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
              <Button loading={deleteMutation.isPending} onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white border-red-600 flex items-center gap-2">
                <FiTrash2 size={15} /> Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
