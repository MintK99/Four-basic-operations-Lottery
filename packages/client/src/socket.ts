import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '@lottery/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket: AppSocket = io({
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
