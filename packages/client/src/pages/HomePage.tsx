import { useState } from 'react';
import type { GameDifficulty } from '@lottery/shared';
import { useGameStore } from '../store/gameStore';
import socket from '../socket';

const DIFFICULTY_OPTIONS: { value: GameDifficulty; label: string; description: string }[] = [
  { value: 'easy', label: '쉬움', description: 'AI가 천천히 움직이고 정답 기회를 자주 놓칩니다.' },
  { value: 'normal', label: '보통', description: 'AI가 적당한 속도와 정확도로 경쟁합니다.' },
  { value: 'hard', label: '어려움', description: 'AI가 빠르고 높은 확률로 정답을 찾아냅니다.' },
];

export function HomePage({ onEnterGame }: { onEnterGame: () => void }) {
  const { setSession, setPlayerName, playerName } = useGameStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<GameDifficulty>('easy');

  function handleStart() {
    setError('');
    if (!playerName.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    const createSoloGame = () => {
      socket.emit('room:create', { playerName: playerName.trim(), difficulty }, (res) => {
        setLoading(false);
        if (res.ok && res.roomId && res.playerId) {
          setSession(res.playerId, res.roomId);
          onEnterGame();
        } else {
          setError(res.message ?? '게임 생성 실패');
        }
      });
    };

    if (!socket.connected) {
      socket.connect();
      socket.once('connect', createSoloGame);
    } else {
      createSoloGame();
    }
  }

  const selectedDifficulty = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)!;

  return (
    <div className="min-h-screen bg-lottery-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✴</div>
          <h1 className="text-3xl font-black text-lottery-gold tracking-wide">
            사칙연산 로또
          </h1>
          <p className="text-gray-400 text-sm mt-2">
            AI보다 먼저 6개의 당첨번호를 완성하세요.
          </p>
        </div>

        <div className="bg-lottery-card rounded-2xl p-6 border border-lottery-panel shadow-xl">
          <div className="mb-5">
            <label className="block text-xs text-gray-400 mb-1 font-medium">플레이어 이름</label>
            <input
              type="text"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={12}
              placeholder="이름 입력"
              className="w-full bg-lottery-dark border border-lottery-panel rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-lottery-gold transition-colors"
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs text-gray-400 mb-1 font-medium">AI 난이도</label>
            <div className="grid grid-cols-3 gap-1 bg-lottery-dark rounded-lg p-1">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDifficulty(option.value)}
                  className={`py-2 rounded-md text-xs font-bold transition-all ${
                    difficulty === option.value
                      ? 'bg-lottery-gold text-lottery-dark'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 min-h-8">
              {selectedDifficulty.description}
            </p>
          </div>

          {error && <p className="text-red-400 text-xs mb-3 text-center">{error}</p>}

          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full py-3 bg-lottery-gold text-lottery-dark font-black rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '대결 준비 중...' : 'AI와 대결 시작'}
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500 text-center space-y-1">
          <p>숫자카드 8장 중 4장과 연산자 3개로 수식을 만드세요.</p>
          <p>버저를 먼저 누르면 30초 동안 답을 제출할 수 있습니다.</p>
          <p>당첨번호 6개를 먼저 완성하면 승리합니다.</p>
        </div>
      </div>
    </div>
  );
}
