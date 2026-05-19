import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents } from '@lottery/shared';
import { GameManager } from './GameManager';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const manager = new GameManager(io);

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('room:create', ({ playerName, difficulty }, cb) => {
    try {
      const { roomId, playerId } = manager.createRoom(socket, playerName, difficulty ?? 'easy');
      cb({ ok: true, roomId, playerId });
    } catch (e) {
      cb({ ok: false, message: String(e) });
    }
  });

  socket.on('room:join', ({ roomId, playerName }, cb) => {
    const result = manager.joinRoom(socket, roomId, playerName);
    cb(result.ok ? { ok: true, playerId: result.playerId } : { ok: false, message: result.message });
  });

  socket.on('game:start', (cb) => {
    const result = manager.startGame(socket.id);
    cb(result);
  });

  socket.on('game:buzz', () => {
    manager.handleBuzz(socket.id);
  });

  socket.on('game:submit', (submission, cb) => {
    manager.handleSubmit(socket.id, submission);
    cb({ ok: true });
  });

  socket.on('game:use_item', ({ cardId }, cb) => {
    const ok = manager.handleUseItem(socket.id, cardId);
    cb({ ok, message: ok ? undefined : '아이템을 사용할 수 없습니다.' });
  });

  socket.on('game:reroll_dice', (cb) => {
    cb(manager.handleRerollDice(socket.id));
  });

  socket.on('game:redraw_numbers', (cb) => {
    cb(manager.handleRedrawNumbers(socket.id));
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    manager.handleDisconnect(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🎲 사칙연산 로또 서버 실행 중 → http://localhost:${PORT}`);
});
