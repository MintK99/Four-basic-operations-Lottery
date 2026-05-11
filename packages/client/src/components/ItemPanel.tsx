import { useState, useEffect } from 'react';
import { useGameStore, useMyPlayer } from '../store/gameStore';
import socket from '../socket';

export function ItemPanel() {
  const { roomState } = useGameStore();
  const myPlayer = useMyPlayer();
  const [now, setNow] = useState(Date.now());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!roomState || !myPlayer) return null;
  if (roomState.phase === 'LOBBY' || roomState.phase === 'GAME_OVER') return null;

  const cooldownRemaining = Math.max(0, myPlayer.itemCooldownUntil - now);
  const canUseItem = cooldownRemaining === 0;

  function handleUseItem() {
    if (!selectedCardId || !canUseItem) return;
    socket.emit('game:use_item', { cardId: selectedCardId }, (res) => {
      if (!res.ok) alert(res.message ?? '아이템 사용 실패');
      else setSelectedCardId(null);
    });
  }

  const cooldownMin = Math.ceil(cooldownRemaining / 60_000);

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel w-full">
      <h2 className="text-white text-sm font-bold mb-3 tracking-wider uppercase opacity-70">
        🃏 카드 교체 아이템
      </h2>

      {!canUseItem ? (
        <p className="text-xs text-gray-500">쿨다운: {cooldownMin}분 남음</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">교체할 카드를 선택하세요</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {myPlayer.cards.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCardId(card.id === selectedCardId ? null : card.id)}
                className={`
                  w-10 h-12 rounded-lg border-2 font-bold text-lg transition-all
                  ${
                    card.id === selectedCardId
                      ? 'bg-red-600 border-red-400 text-white scale-110'
                      : 'bg-lottery-dark border-lottery-panel text-white hover:border-gray-400'
                  }
                `}
              >
                {card.value}
              </button>
            ))}
          </div>
          <button
            onClick={handleUseItem}
            disabled={!selectedCardId}
            className={`
              w-full py-2 rounded-lg text-sm font-medium transition-all
              ${
                selectedCardId
                  ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            카드 교체 (30분 쿨다운)
          </button>
        </>
      )}
    </div>
  );
}
