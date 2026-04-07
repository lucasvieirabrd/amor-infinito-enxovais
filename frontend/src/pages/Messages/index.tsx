import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import socket from '../../services/socket';
import { 
  FiSearch, FiSend, FiUser, FiClock, 
  FiTag, FiCheck, FiCheckCircle, FiInfo 
} from 'react-icons/fi';
import { format } from 'date-fns';

interface Conversation {
  id: string;
  fromPhone: string;
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

export const Messages: React.FC = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Listar conversas
  const { data: conversations, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await api.get('/messages/conversations');
      return response.data as Conversation[];
    },
  });

  // Buscar histórico de chat
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
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

  // Mutação para atualizar CRM (Tag)
  const updateCRMMutation = useMutation({
    mutationFn: (data: { id: string, tag: string }) => api.patch(`/messages/${data.id}/crm`, { tag: data.tag }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // WebSocket: Receber novas mensagens em tempo real
  useEffect(() => {
    socket.connect();
    
    socket.on('new_message', (message: any) => {
      if (selectedConversation && message.fromPhone === selectedConversation.fromPhone) {
        queryClient.invalidateQueries({ queryKey: ['chat-history', selectedConversation.fromPhone] });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on('conversation_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    return () => {
      socket.off('new_message');
      socket.off('conversation_updated');
      socket.disconnect();
    };
  }, [selectedConversation, queryClient]);

  // Scroll automático para o fim do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;
    sendMutation.mutate({
      to: selectedConversation.fromPhone,
      content: newMessage,
    });
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'cobrança': return 'bg-red-100 text-red-600 border-red-200';
      case 'lead': return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'suporte': return 'bg-green-100 text-green-600 border-green-200';
      default: return 'bg-gray-100 text-gray-500 border-gray-200';
    }
  };

  return (
    <div className="flex h-[calc(100vh-160px)] bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Lista de Conversas (Esquerda) */}
      <div className="w-80 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Mensagens</h3>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar conversa..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : conversations?.map(conv => (
            <button 
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className={`w-full flex items-center p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedConversation?.id === conv.id ? 'bg-primary-50 border-l-4 border-l-primary-600' : ''
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold mr-3 flex-shrink-0">
                {conv.customerName?.charAt(0) || <FiUser />}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-sm font-bold text-gray-800 truncate">
                    {conv.customerName || conv.fromPhone}
                  </h4>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {format(new Date(conv.lastMessageAt), 'HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{conv.lastMessage}</p>
                {conv.tag !== 'none' && (
                  <span className={`mt-2 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${getTagColor(conv.tag)}`}>
                    {conv.tag}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Janela de Chat (Centro) */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            {/* Header do Chat */}
            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mr-3">
                  {selectedConversation.customerName?.charAt(0) || <FiUser />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">
                    {selectedConversation.customerName || selectedConversation.fromPhone}
                  </h4>
                  <p className="text-xs text-green-500 flex items-center">
                    <span className="h-2 w-2 bg-green-500 rounded-full mr-1"></span> Online via WhatsApp
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <select 
                  className="text-xs border-gray-200 rounded-md py-1"
                  value={selectedConversation.tag}
                  onChange={(e) => updateCRMMutation.mutate({ id: selectedConversation.id, tag: e.target.value })}
                >
                  <option value="none">Sem Tag</option>
                  <option value="cobrança">Cobrança</option>
                  <option value="lead">Lead</option>
                  <option value="suporte">Suporte</option>
                </select>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages?.map(msg => (
                <div 
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] p-3 rounded-xl shadow-sm text-sm ${
                    msg.direction === 'outbound' 
                      ? 'bg-primary-600 text-white rounded-tr-none' 
                      : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                  }`}>
                    <p>{msg.content}</p>
                    <div className={`flex items-center justify-end mt-1 gap-1 text-[10px] ${
                      msg.direction === 'outbound' ? 'text-primary-100' : 'text-gray-400'
                    }`}>
                      {format(new Date(msg.timestamp), 'HH:mm')}
                      {msg.direction === 'outbound' && (
                        msg.status === 'read' ? <FiCheckCircle className="text-green-300" /> : <FiCheck />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input de Mensagem */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100">
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Digite sua mensagem..."
                  className="flex-1 border-gray-200 rounded-lg focus:ring-primary-500 focus:border-primary-500 text-sm"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  <FiSend size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50">
            <FiMessageSquare size={64} className="mb-4" />
            <p>Selecione uma conversa para iniciar o atendimento</p>
          </div>
        )}
      </div>

      {/* Info CRM (Direita - Opcional) */}
      {selectedConversation && (
        <div className="w-64 border-l border-gray-100 p-6 bg-white hidden xl:block">
          <h4 className="text-sm font-bold text-gray-800 mb-6 flex items-center">
            <FiInfo className="mr-2" /> Detalhes do Contato
          </h4>
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Telefone</p>
              <p className="text-sm text-gray-700 font-medium">{selectedConversation.fromPhone}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Status CRM</p>
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${getTagColor(selectedConversation.tag)}`}>
                {selectedConversation.tag === 'none' ? 'Sem Classificação' : selectedConversation.tag.toUpperCase()}
              </div>
            </div>
            <div className="pt-6 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Notas Internas</p>
              <textarea 
                className="w-full text-xs border-gray-200 rounded-md p-2 h-32 resize-none"
                placeholder="Adicione observações sobre este atendimento..."
                defaultValue={selectedConversation.notes}
              ></textarea>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FiMessageSquare = ({ className, size }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} height={size} 
    viewBox="0 0 24 24" fill="none" 
    stroke="currentColor" strokeWidth="2" 
    strokeLinecap="round" strokeLinejoin="round" 
    className={className}
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
