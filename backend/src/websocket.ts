import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

const allowedOrigins = [
  'https://sistema-vendas-cobranca-aie.up.railway.app',
  'http://localhost:5173'
];

export function setupWebSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Novo cliente conectado: ${socket.id}`);

    socket.on('join_chat', (phone) => {
      socket.join(phone);
      console.log(`[WS] Cliente ${socket.id} entrou na sala do chat: ${phone}`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io não foi inicializado');
  }
  return io;
}

/**
 * Notifica os clientes conectados sobre uma nova mensagem recebida.
 */
export function notifyNewMessage(phone: string, message: any) {
  if (io) {
    io.to(phone).emit('new_message', message);
    io.emit('conversation_updated', message); // Atualiza a lista de conversas globalmente
  }
}
