import { useGameStore } from '../store/gameStore';
import { WinningNumbers } from '../components/WinningNumbers';
import { DicePanel } from '../components/DicePanel';
import { TimerBar } from '../components/TimerBar';
import { PlayerList } from '../components/PlayerList';
import { BuzzerButton } from '../components/BuzzerButton';
import { FormulaBuilder } from '../components/FormulaBuilder';
import { ItemPanel } from '../components/ItemPanel';
import socket from '../socket';

const DIFFICULTY_LABEL = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
} as const;

export function GamePage() {
  const { roomState, playerId } = useGameStore();

  if (!roomState) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        <p className="animate-pulse">AI 대결 준비 중...</p>
      </div>
    );
  }

  const { phase, winner, players, hostId, difficulty } = roomState;
  const isHost = playerId === hostId;

  if (phase === 'GAME_OVER' && winner) {
    const winnerPlayer = players.find((player) => player.id === winner);
    const isMe = winner === playerId;

    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-lottery-dark px-4 text-center">
        <div className="text-6xl">{isMe ? '★' : '×'}</div>
        <h1 className={`text-4xl font-black ${isMe ? 'text-lottery-gold' : 'text-red-400'}`}>
          {isMe ? '승리!' : 'AI 승리'}
        </h1>
        <p className="text-gray-400">
          {isMe
            ? 'AI보다 먼저 6개의 당첨번호를 완성했습니다.'
            : `${winnerPlayer?.name ?? 'AI'}가 먼저 6개의 당첨번호를 완성했습니다.`}
        </p>
        <div className="flex gap-3 mt-4">
          {isHost && (
            <button
              onClick={() => socket.emit('game:start', () => {})}
              className="px-6 py-3 bg-lottery-gold text-lottery-dark font-bold rounded-xl hover:brightness-110 transition-all"
            >
              같은 난이도로 다시 시작
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gray-700 text-white font-medium rounded-xl hover:bg-gray-600 transition-all"
          >
            난이도 선택
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-lottery-dark text-white p-4">
      <header className="flex items-center justify-between gap-3 mb-4 max-w-6xl mx-auto">
        <h1 className="text-lottery-gold font-black text-lg tracking-wide">사칙연산 로또</h1>
        <span className="text-xs text-gray-400 bg-lottery-card px-3 py-1 rounded-lg border border-lottery-panel">
          AI 난이도: <span className="text-white font-bold">{DIFFICULTY_LABEL[difficulty]}</span>
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        <div className="flex flex-col gap-4">
          <WinningNumbers />
          <DicePanel />
          <TimerBar />
          {phase === 'LOBBY' && isHost && (
            <button
              onClick={() => socket.emit('game:start', () => {})}
              className="py-3 bg-lottery-gold text-lottery-dark font-black rounded-xl hover:brightness-110 transition-all"
            >
              게임 시작
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 items-center justify-start">
          <BuzzerButton />
          <FormulaBuilder />
          <ItemPanel />
        </div>

        <div>
          <PlayerList />
        </div>
      </div>
    </div>
  );
}
