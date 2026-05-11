import { useGameStore } from '../store/gameStore';
import { GAME_CONFIG } from '@lottery/shared';

export function PlayerList() {
  const { roomState, playerId } = useGameStore();
  if (!roomState) return null;

  const { players, buzzedPlayerId } = roomState;

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel">
      <h2 className="text-white text-sm font-bold mb-3 tracking-wider uppercase opacity-70">
        👥 플레이어
      </h2>
      <div className="flex flex-col gap-2">
        {players.map((p) => {
          const isMe = p.id === playerId;
          const isBuzzed = p.id === buzzedPlayerId;
          const progress = p.completedNumbers.length;

          return (
            <div
              key={p.id}
              className={`
                rounded-lg p-3 border transition-all
                ${isBuzzed ? 'border-lottery-gold bg-yellow-900/30 shadow-lg' : 'border-lottery-panel bg-lottery-dark'}
                ${!p.isConnected ? 'opacity-40' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isBuzzed && <span className="text-lottery-gold animate-pulse">🔔</span>}
                  <span className={`font-semibold text-sm ${isMe ? 'text-lottery-gold' : 'text-white'}`}>
                    {p.name} {isMe && <span className="text-xs opacity-60">(나)</span>}
                  </span>
                  {!p.isConnected && <span className="text-xs text-gray-500">(오프라인)</span>}
                </div>
                <span className="text-xs text-gray-400">
                  {progress} / {GAME_CONFIG.WINNING_NUMBER_COUNT}
                </span>
              </div>

              {/* 진행 바 */}
              <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-lottery-gold rounded-full transition-all duration-500"
                  style={{ width: `${(progress / GAME_CONFIG.WINNING_NUMBER_COUNT) * 100}%` }}
                />
              </div>

              {/* 완성한 번호들 */}
              {p.completedNumbers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.completedNumbers.map((n) => (
                    <span
                      key={n}
                      className="text-xs bg-lottery-gold text-lottery-dark rounded-full px-2 py-0.5 font-bold"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )}

              {/* 카드 패 (내 카드만 표시) */}
              {isMe && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {p.cards.map((c) => (
                    <span
                      key={c.id}
                      className="w-6 h-6 bg-lottery-panel rounded text-xs flex items-center justify-center text-white font-bold"
                    >
                      {c.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
