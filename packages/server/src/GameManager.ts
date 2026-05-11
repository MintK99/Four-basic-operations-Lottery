import { v4 as uuidv4 } from 'uuid';
import { GameRoom, GameRoomEvent } from './GameRoom';
import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  FormulaSubmission,
} from '@lottery/shared';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface SessionInfo {
  playerId: string;
  roomId: string;
}

export class GameManager {
  private rooms: Map<string, GameRoom> = new Map();
  private sessions: Map<string, SessionInfo> = new Map(); // socketId → session
  private io: AppServer;

  constructor(io: AppServer) {
    this.io = io;
  }

  // ── 룸 생성 ───────────────────────────────────────────────

  createRoom(socket: AppSocket, playerName: string): { roomId: string; playerId: string } {
    const playerId = uuidv4();
    const room = new GameRoom(playerId);
    this.rooms.set(room.id, room);

    this.setupRoomEvents(room);

    socket.join(room.id);
    this.sessions.set(socket.id, { playerId, roomId: room.id });
    room.addPlayer(socket.id, playerId, playerName);

    return { roomId: room.id, playerId };
  }

  // ── 룸 참가 ───────────────────────────────────────────────

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

  // ── 게임 시작 ─────────────────────────────────────────────

  startGame(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };

    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };

    if (room.hostId !== session.playerId) return { ok: false, message: '호스트만 게임을 시작할 수 있습니다.' };

    room.startGame();
    return { ok: true };
  }

  // ── 버저 ──────────────────────────────────────────────────

  handleBuzz(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    room.handleBuzz(session.playerId);
  }

  // ── 수식 제출 ─────────────────────────────────────────────

  handleSubmit(socketId: string, submission: FormulaSubmission): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    room.handleSubmit(session.playerId, submission);
  }

  // ── 아이템 사용 ───────────────────────────────────────────

  handleUseItem(socketId: string, cardId: string): boolean {
    const session = this.sessions.get(socketId);
    if (!session) return false;

    const room = this.rooms.get(session.roomId);
    if (!room) return false;

    return room.handleUseItem(session.playerId, cardId);
  }

  // ── 호스트 전용 ───────────────────────────────────────────

  handleRerollDice(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };
    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };
    if (room.hostId !== session.playerId) return { ok: false, message: '호스트만 사용할 수 있습니다.' };
    room.forceRerollDice();
    return { ok: true };
  }

  handleRedrawNumbers(socketId: string): { ok: boolean; message?: string } {
    const session = this.sessions.get(socketId);
    if (!session) return { ok: false, message: '세션을 찾을 수 없습니다.' };
    const room = this.rooms.get(session.roomId);
    if (!room) return { ok: false, message: '룸을 찾을 수 없습니다.' };
    if (room.hostId !== session.playerId) return { ok: false, message: '호스트만 사용할 수 있습니다.' };
    room.forceRedrawNumbers();
    return { ok: true };
  }

  // ── 연결 해제 ─────────────────────────────────────────────

  handleDisconnect(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    const room = this.rooms.get(session.roomId);
    if (room) {
      room.removePlayer(session.playerId);
      // 빈 룸은 즉시 정리하지 않고 재접속 여유를 둠
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

  // ── 룸 이벤트 → Socket.io 브로드캐스트 ───────────────────

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
