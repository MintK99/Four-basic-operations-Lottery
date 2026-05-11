import { useState } from 'react';
import { useGameStore, useMyPlayer } from '../store/gameStore';
import { GAME_CONFIG } from '@lottery/shared';
import socket from '../socket';

export function ItemPanel() {
  const { roomState } = useGameStore();
  const myPlayer = useMyPlayer();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  if (!roomState || !myPlayer) return null;
  if (roomState.phase === 'LOBBY' || roomState.phase === 'GAME_OVER') return null;

  const usesLeft = GAME_CONFIG.ITEM_USES_PER_ROUND - myPlayer.itemUsesThisRound;
  const canUseItem = usesLeft > 0;

  function handleUseItem() {
    if (!selectedCardId || !canUseItem) return;
    socket.emit('game:use_item', { cardId: selectedCardId }, (res) => {
      if (!res.ok) alert(res.message ?? '아이템 사용 실패');
      else setSelectedCardId(null);
    });
  }

  return (
    <div className="bg-lottery-card rounded-xl p-4 border border-lottery-panel w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-sm font-bold tracking-wider uppercase opacity-70">
          🃏 카드 교체
        </h2>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${canUseItem ? 'bg-blue-700 text-blue-200' : 'bg-gray-700 text-gray-500'}`}>
          남은 횟수: {usesLeft}
        </span>
      </div>

      <p className="text-xs text-gray-400 mb-2">
        {canUseItem ? '교체할 카드를 선택하세요' : '이번 라운드 교체 횟수를 모두 사용했습니다.'}
      </p>

      {/* 카드는 항상 표시 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {myPlayer.cards.map((card) => (
          <button
            key={card.id}
            disabled={!canUseItem}
            onClick={() => canUseItem && setSelectedCardId(card.id === selectedCardId ? null : card.id)}
            className={`
              w-10 h-12 rounded-lg border-2 font-bold text-lg transition-all
              ${
                card.id === selectedCardId
                  ? 'bg-red-600 border-red-400 text-white scale-110'
                  : canUseItem
                  ? 'bg-lottery-dark border-lottery-panel text-white hover:border-gray-400 cursor-pointer'
                  : 'bg-lottery-dark border-lottery-panel text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {card.value}
          </button>
        ))}
      </div>

      <button
        onClick={handleUseItem}
        disabled={!selectedCardId || !canUseItem}
        className={`
          w-full py-2 rounded-lg text-sm font-medium transition-all
          ${
            selectedCardId && canUseItem
              ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        카드 교체
      </button>
    </div>
  );
}
