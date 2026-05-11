import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import socket from '../socket';

export function HomePage({ onEnterGame }: { onEnterGame: () => void }) {
  const { setSession, setPlayerName, playerName } = useGameStore();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'create' | 'join'>('create');

  function connect(fn: () => void) {
    setError('');
    if (!playerName.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    setLoading(true);
    if (!socket.connected) {
      socket.connect();
      socket.once('connect', fn);
    } else {
      fn();
    }
  }

  function handleCreate() {
    connect(() => {
      socket.emit('room:create', { playerName: playerName.trim() }, (res) => {
        setLoading(false);
        if (res.ok && res.roomId && res.playerId) {
          setSession(res.playerId, res.roomId);
          onEnterGame();
        } else {
          setError(res.message ?? '룸 생성 실패');
        }
      });
    });
  }

  function handleJoin() {
    if (!roomIdInput.trim()) {
      setError('룸 코드를 입력해주세요.');
      return;
    }
    connect(() => {
      socket.emit(
        'room:join',
        { roomId: roomIdInput.trim().toUpperCase(), playerName: playerName.trim() },
        (res) => {
          setLoading(false);
          if (res.ok && res.playerId) {
            setSession(res.playerId, roomIdInput.trim().toUpperCase());
            onEnterGame();
          } else {
            setError(res.message ?? '룸 참가 실패');
          }
        }
      );
    });
  }

  return (
    <div className="min-h-screen bg-lottery-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 타이틀 */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✴</div>
          <h1 className="text-3xl font-black text-lottery-gold tracking-wide">
            사칙연산 로또
          </h1>
          <p className="text-gray-400 text-sm mt-2">
            수식을 만들어 6개의 당첨번호를 완성하라!
          </p>
        </div>

        <div className="bg-lottery-card rounded-2xl p-6 border border-lottery-panel shadow-xl">
          {/* 이름 입력 */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1 font-medium">닉네임</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              placeholder="닉네임 입력"
              className="w-full bg-lottery-dark border border-lottery-panel rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-lottery-gold transition-colors"
            />
          </div>

          {/* 탭 */}
          <div className="flex bg-lottery-dark rounded-lg p-1 mb-4">
            {(['create', 'join'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`
                  flex-1 py-2 rounded-md text-sm font-medium transition-all
                  ${tab === t ? 'bg-lottery-panel text-white' : 'text-gray-500 hover:text-gray-300'}
                `}
              >
                {t === 'create' ? '룸 만들기' : '룸 참가'}
              </button>
            ))}
          </div>

          {/* 룸 참가 입력 */}
          {tab === 'join' && (
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1 font-medium">룸 코드</label>
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="6자리 코드"
                className="w-full bg-lottery-dark border border-lottery-panel rounded-lg px-4 py-2.5 text-white text-sm uppercase tracking-widest text-center font-mono focus:outline-none focus:border-lottery-gold transition-colors"
              />
            </div>
          )}

          {/* 에러 */}
          {error && (
            <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
          )}

          {/* 버튼 */}
          <button
            onClick={tab === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            className="w-full py-3 bg-lottery-gold text-lottery-dark font-black rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '연결 중...' : tab === 'create' ? '🎲 룸 만들기' : '▶ 입장하기'}
          </button>
        </div>

        {/* 룰 요약 */}
        <div className="mt-6 text-xs text-gray-500 text-center space-y-1">
          <p>숫자카드 8장 중 4장 + 연산자 3개로 당첨번호와 같은 수식을 만드세요.</p>
          <p>먼저 버저를 누른 플레이어에게 15초가 주어집니다.</p>
          <p>6개를 먼저 완성한 플레이어가 승리!</p>
        </div>
      </div>
    </div>
  );
}
