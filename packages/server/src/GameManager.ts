import { v4 as uuidv4 } from 'uuid';
import { GameRoom, GameRoomEvent } from './GameRoom';
import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  FormulaSubmission,
  GameDifficulty,
} from '@lottery/shared';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface SessionInfo {
  playerId: string;
  roomId: string;
}

export class GameManager {
  private rooms: Map<string, GameRoom> = new Map();
  private sessions: Map<string, SessionInfo> = new Map();
  private io: AppServer;

  constructor(io: AppServer) {
    this.io = io;
  }

  createRoom(socket: AppSocket, playerName: string, difficulty: GameDifficulty = 'easy'): { roomId: string; playerId: string } {
    const playerId = uuidv4();
    const room = new GameRoom(playerId, difficulty);
    this.rooms.set(room.id, room);
    this.setupRoomEvents(room);

    socket.join(room.id);
    this.sessions.set(socket.id, { playerId, roomId: room.id });
    room.addPlayer(socket.id, playerId, playerName);
    room.addAiPlayer();
    room.startGame();

    return { roomId: room.id, playerId };
  }

  joinRoom(
    socket: AppSocket,
    roomId: string,
    playerName: string
  ): { ok: boolean; playerId?: string; message?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };

    const playerId = uuidv4();
    socket.join(roomId);
    this.sessions.set(socket.id, { playerId, roomId });
    room.addPlayer(socket.id, playerId, playerName);

    return { ok: true, playerId };
  }

  startGame(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };

    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };
    if (room.hostId !== session.playerId) return { ok: false, message: '플레이어만 게임을 시작할 수 있습니다.' };

    room.startGame();
    return { ok: true };
  }

  handleBuzz(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;
    this.rooms.get(session.roomId)?.handleBuzz(session.playerId);
  }

  handleSubmit(socketId: string, submission: FormulaSubmission): void {
    const session = this.sessions.get(socketId);
    if (!session) return;
    this.rooms.get(session.roomId)?.handleSubmit(session.playerId, submission);
  }

  handleUseItem(socketId: string, cardId: string): boolean {
    const session = this.sessions.get(socketId);
    if (!session) return false;
    return this.rooms.get(session.roomId)?.handleUseItem(session.playerId, cardId) ?? false;
  }

  handleRerollDice(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };
    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };
    if (room.hostId !== session.playerId) return { ok: false, message: '플레이어만 사용할 수 있습니다.' };
    room.forceRerollDice();
    return { ok: true };
  }

  handleRedrawNumbers(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };
    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };
    if (room.hostId !== session.playerId) return { ok: false, message: '플레이어만 사용할 수 있습니다.' };
    room.forceRedrawNumbers();
    return { ok: true };
  }

  handleDisconnect(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (room) {
      room.removePlayer(session.playerId);
      if (room.isEmpty()) {
        setTimeout(() => {
          if (room.isEmpty()) {
            room.destroy();
            this.rooms.delete(room.id);
          }
        }, 30_000);
      }
    }

    this.sessions.delete(socketId);
  }

  private setupRoomEvents(room: GameRoom): void {
    room.on((event: GameRoomEvent) => {
      switch (event.type) {
        case 'state_changed':
          this.io.to(room.id).emit('room:state', room.toSnapshot());
          break;
        case 'dice_rolled':
          this.io.to(room.id).emit('game:dice_rolled', {
            operators: event.operators,
            roundTimerEnd: event.roundTimerEnd,
          });
          break;
        case 'buzz_granted':
          this.io.to(room.id).emit('game:buzz_granted', {
            playerId: event.playerId,
            playerName: event.playerName,
            buzzTimerEnd: event.buzzTimerEnd,
          });
          break;
        case 'submit_result':
          this.io.to(room.id).emit('game:submit_result', event.payload);
          break;
        case 'dice_reset':
          this.io.to(room.id).emit('game:dice_reset', { reason: event.reason });
          break;
        case 'game_over':
          this.io.to(room.id).emit('game:over', {
            winnerId: event.winnerId,
            winnerName: event.winnerName,
          });
          break;
      }
    });
  }
}
