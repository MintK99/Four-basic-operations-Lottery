import { useGameStore } from '../store/gameStore';

export function WinningNumbers() {
  const roomState = useGameStore((s) => s.roomState);
  if (!roomState) return null;

  const { winningNumbers, remainingNumbers } = roomState;

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel">
      <h2 className="text-lottery-gold text-sm font-bold mb-3 tracking-wider uppercase">
        🎰 당첨 번호
      </h2>
      <div className="flex flex-wrap gap-2 justify-center">
        {winningNumbers.map((num) => {
          const completed = !remainingNumbers.includes(num);
          return (
            <div
              key={num}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                border-2 transition-all duration-500
                ${
                  completed
                    ? 'bg-lottery-gold border-lottery-gold text-lottery-dark line-through opacity-60'
                    : 'bg-lottery-dark border-lottery-gold text-lottery-gold'
                }
              `}
            >
              {num}
            </div>
          );
        })}
      </div>
    </div>
  );
}
