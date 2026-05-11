import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

export function TimerBar() {
  const roomState = useGameStore((s) => s.roomState);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  if (!roomState) return null;

  const { buzzTimerEnd, roundTimerEnd, phase } = roomState;

  if (phase === 'BUZZED' && buzzTimerEnd) {
    const remaining = Math.max(0, buzzTimerEnd - now);
    const total = 15_000;
    const pct = (remaining / total) * 100;

    return (
      <TimerDisplay
        remaining={remaining}
        pct={pct}
        color="bg-red-500"
        label="수식 입력 시간"
        urgent={remaining < 5_000}
      />
    );
  }

  if ((phase === 'ROLLING' || phase === 'BUZZED') && roundTimerEnd) {
    const remaining = Math.max(0, roundTimerEnd - now);
    const total = 180_000;
    const pct = (remaining / total) * 100;

    return (
      <TimerDisplay
        remaining={remaining}
        pct={pct}
        color="bg-blue-500"
        label="라운드 시간"
        urgent={remaining < 30_000}
      />
    );
  }

  return null;
}

function TimerDisplay({
  remaining,
  pct,
  color,
  label,
  urgent,
}: {
  remaining: number;
  pct: number;
  color: string;
  label: string;
  urgent: boolean;
}) {
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="bg-lottery-card rounded-xl p-3 border border-lottery-panel">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className={`text-lg font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {secs}s
        </span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-100 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
