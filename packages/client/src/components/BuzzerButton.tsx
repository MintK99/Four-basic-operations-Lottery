import { useGameStore, useMyPlayer } from '../store/gameStore';
import socket from '../socket';

export function BuzzerButton() {
  const { roomState, playerId } = useGameStore();
  const myPlayer = useMyPlayer();

  if (!roomState || !myPlayer) return null;

  const { phase, buzzedPlayerId } = roomState;

  const isBuzzed = buzzedPlayerId === playerId;
  const canPress =
    phase === 'ROLLING' && myPlayer.canBuzz && buzzedPlayerId === null;
  const isSomeoneElseBuzzed = phase === 'BUZZED' && !isBuzzed;

  function handleBuzz() {
    if (!canPress) return;
    socket.emit('game:buzz', { clientTimestamp: Date.now() });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleBuzz}
        disabled={!canPress}
        className={`
          relative w-32 h-32 rounded-full font-black text-xl border-4 transition-all duration-200
          select-none focus:outline-none
          ${
            isBuzzed
              ? 'bg-lottery-gold border-yellow-300 text-lottery-dark scale-110 shadow-[0_0_30px_rgba(245,166,35,0.8)] animate-buzz-pulse'
              : canPress
              ? 'bg-red-600 border-red-400 text-white hover:bg-red-500 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.6)] cursor-pointer'
              : 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed opacity-50'
          }
        `}
      >
        {isBuzzed ? '🔔 입력 중' : '🔔 버저'}
      </button>

      <div className="text-xs text-center text-gray-400 h-4">
        {isBuzzed && '수식을 완성하세요!'}
        {isSomeoneElseBuzzed && '다른 플레이어가 답변 중...'}
        {!myPlayer.canBuzz && phase === 'ROLLING' && '이번 라운드 참여 불가'}
        {phase === 'LOBBY' && '게임 시작을 기다리는 중...'}
      </div>
    </div>
  );
}
