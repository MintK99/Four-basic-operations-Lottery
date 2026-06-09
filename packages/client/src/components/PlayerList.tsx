import { useGameStore } from '../store/gameStore';
import { GAME_CONFIG } from '@lottery/shared';

export function PlayerList() {
  const { roomState, playerId } = useGameStore();
  if (!roomState) return null;

  const { players, buzzedPlayerId } = roomState;

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel">
      <h2 className="text-white text-sm font-bold mb-3 tracking-wider uppercase opacity-70">
        대결 현황
      </h2>
      <div className="flex flex-col gap-2">
        {players.map((player) => {
          const isMe = player.id === playerId;
          const isBuzzed = player.id === buzzedPlayerId;
          const progress = player.completedNumbers.length;

          return (
            <div
              key={player.id}
              className={`rounded-lg p-3 border transition-all ${
                isBuzzed
                  ? 'border-lottery-gold bg-yellow-900/30 shadow-lg'
                  : 'border-lottery-panel bg-lottery-dark'
              } ${!player.isConnected ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isBuzzed && <span className="text-lottery-gold animate-pulse">●</span>}
                  <span className={`font-semibold text-sm truncate ${isMe ? 'text-lottery-gold' : 'text-white'}`}>
                    {player.name}
                  </span>
                  {isMe && <span className="text-xs text-gray-500">나</span>}
                  {player.isBot && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-800">
                      AI
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {progress} / {GAME_CONFIG.WINNING_NUMBER_COUNT}
                </span>
              </div>

              <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    player.isBot ? 'bg-red-500' : 'bg-lottery-gold'
                  }`}
                  style={{ width: `${(progress / GAME_CONFIG.WINNING_NUMBER_COUNT) * 100}%` }}
                />
              </div>

              {player.completedNumbers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {player.completedNumbers.map((number) => (
                    <span
                      key={number}
                      className={`text-xs rounded-full px-2 py-0.5 font-bold ${
                        player.isBot
                          ? 'bg-red-500 text-white'
                          : 'bg-lottery-gold text-lottery-dark'
                      }`}
                    >
                      {number}
                    </span>
                  ))}
                </div>
              )}

              {isMe && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {player.cards.map((card) => (
                    <span
                      key={card.id}
                      className="w-6 h-6 bg-lottery-panel rounded text-xs flex items-center justify-center text-white font-bold"
                    >
                      {card.value}
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
