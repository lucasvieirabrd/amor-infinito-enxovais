import { io } from 'socket.io-client';

const socket = io(
  import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://talented-perception-production.up.railway.app',
  {
    withCredentials: true,
    autoConnect: false,
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  }
);

export default socket;
