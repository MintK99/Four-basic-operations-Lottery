import { useGameStore } from '../store/gameStore';
import { WinningNumbers } from '../components/WinningNumbers';
import { DicePanel } from '../components/DicePanel';
import { TimerBar } from '../components/TimerBar';
import { PlayerList } from '../components/PlayerList';
import { BuzzerButton } from '../components/BuzzerButton';
import { FormulaBuilder } from '../components/FormulaBuilder';
import { ItemPanel } from '../components/ItemPanel';
import socket from '../socket';

export function GamePage() {
  const { roomState, playerId, roomId } = useGameStore();

  if (!roomState) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        <p className="animate-pulse">연결 중...</p>
      </div>
    );
  }

  const { phase, winner, players, hostId } = roomState;
  const isHost = players.find((p) => p.id === playerId)?.id === hostId;

  if (phase === 'GAME_OVER' && winner) {
    const winnerPlayer = players.find((p) => p.id === winner);
    const isMe = winner === playerId;
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-lottery-dark">
        <div className="text-6xl">{isMe ? '🏆' : '🎉'}</div>
        <h1 className="text-4xl font-black text-lottery-gold">
          {isMe ? '승리!' : `${winnerPlayer?.name ?? '?'} 승리!`}
        </h1>
        <p className="text-gray-400">
          {winnerPlayer?.name}님이 6개의 당첨번호를 모두 완성했습니다.
        </p>
        <div className="flex gap-3 mt-4">
          {isHost && (
            <button
              onClick={() => socket.emit('game:start', () => {})}
              className="px-6 py-3 bg-lottery-gold text-lottery-dark font-bold rounded-xl hover:brightness-110 transition-all"
            >
              다시 시작
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gray-700 text-white font-medium rounded-xl hover:bg-gray-600 transition-all"
          >
            나가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-lottery-dark text-white p-4">
      {/* 헤더 */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lottery-gold font-black text-lg tracking-wide">✴ 사칙연산 로또</h1>
        <span className="text-xs text-gray-500 font-mono bg-lottery-card px-3 py-1 rounded-lg border border-lottery-panel">
          룸 코드: <span className="text-white font-bold">{roomId}</span>
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {/* 왼쪽 패널 */}
        <div className="flex flex-col gap-4">
          <WinningNumbers />
          <DicePanel />
          <TimerBar />
          {phase === 'LOBBY' && isHost && (
            <button
              onClick={() => socket.emit('game:start', () => {})}
              className="py-3 bg-lottery-gold text-lottery-dark font-black rounded-xl hover:brightness-110 transition-all"
            >
              🎲 게임 시작
            </button>
          )}
          {phase === 'LOBBY' && !isHost && (
            <p className="text-center text-sm text-gray-500 bg-lottery-card rounded-xl py-3 border border-lottery-panel">
              호스트가 시작하기를 기다리는 중...
            </p>
          )}
        </div>

        {/* 중앙 패널 */}
        <div className="flex flex-col gap-4 items-center justify-start">
          <BuzzerButton />
          <FormulaBuilder />
          <ItemPanel />
        </div>

        {/* 오른쪽 패널 */}
        <div>
          <PlayerList />
        </div>
      </div>
    </div>
  );
}
