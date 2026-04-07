import { io } from 'socket.io-client';

const BACKEND_URL = 'https://talented-perception-production.up.railway.app';

export const socket = io(BACKEND_URL, {
  transports: ['polling'],
  withCredentials: true,
});

export default socket;
