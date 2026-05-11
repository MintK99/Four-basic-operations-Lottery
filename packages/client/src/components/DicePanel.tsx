import { useGameStore } from '../store/gameStore';

const OPERATOR_SYMBOLS: Record<string, string> = {
  '+': '+',
  '-': '−',
  '×': '×',
  '÷': '÷',
  '^': '^',
  '★': '★',
};

const OPERATOR_COLORS: Record<string, string> = {
  '+': 'text-green-400',
  '-': 'text-red-400',
  '×': 'text-blue-400',
  '÷': 'text-yellow-400',
  '^': 'text-purple-400',
  '★': 'text-orange-400',
};

export function DicePanel() {
  const roomState = useGameStore((s) => s.roomState);
  if (!roomState) return null;

  const { currentOperators, phase } = roomState;

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel">
      <h2 className="text-white text-sm font-bold mb-3 tracking-wider uppercase opacity-70">
        🎲 연산 주사위
      </h2>
      <div className="flex gap-3 justify-center">
        {currentOperators && currentOperators.length === 3 ? (
          currentOperators.map((op, i) => (
            <div
              key={i}
              className={`
                w-14 h-14 rounded-lg bg-lottery-dark border-2 border-lottery-panel
                flex items-center justify-center text-2xl font-bold
                ${OPERATOR_COLORS[op] ?? 'text-white'}
                ${phase === 'ROLLING' || phase === 'BUZZED' ? 'shadow-lg' : ''}
              `}
            >
              {OPERATOR_SYMBOLS[op] ?? op}
            </div>
          ))
        ) : (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="w-14 h-14 rounded-lg bg-lottery-dark border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-600 text-2xl"
            >
              ?
            </div>
          ))
        )}
      </div>
    </div>
  );
}
