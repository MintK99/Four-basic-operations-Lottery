import { useState } from 'react';
import { Card, Operator, FormulaSubmission } from '@lottery/shared';
import { evaluate } from '@lottery/shared';
import { useGameStore, useMyPlayer } from '../store/gameStore';
import socket from '../socket';

const OPERATOR_DISPLAY: Record<Operator, string> = {
  '+': '+', '-': '−', '×': '×', '÷': '÷', '^': '^', '★': '★',
};

const OPERATOR_COLORS: Record<Operator, string> = {
  '+': 'text-green-400 border-green-600',
  '-': 'text-red-400 border-red-600',
  '×': 'text-blue-400 border-blue-600',
  '÷': 'text-yellow-400 border-yellow-600',
  '^': 'text-purple-400 border-purple-600',
  '★': 'text-orange-400 border-orange-600',
};

export function FormulaBuilder() {
  const { roomState, playerId } = useGameStore();
  const myPlayer = useMyPlayer();

  const [cardSlots, setCardSlots] = useState<(Card | null)[]>([null, null, null, null]);
  // 주사위 인덱스(0·1·2)를 저장 — 어떤 주사위가 어느 슬롯에 들어갔는지 추적
  const [opSlots, setOpSlots] = useState<(number | null)[]>([null, null, null]);

  if (!roomState || !myPlayer) return null;

  const { buzzedPlayerId, currentOperators } = roomState;
  const isMeBuzzed = buzzedPlayerId === playerId;

  if (!isMeBuzzed) return null;
  if (!currentOperators || currentOperators.length !== 3) return null;

  // 이미 사용된 카드 id
  const usedCardIds = new Set(cardSlots.filter(Boolean).map((c) => c!.id));
  // 이미 사용된 주사위 인덱스
  const usedDiceIndices = new Set(opSlots.filter((v) => v !== null) as number[]);

  function placeCard(card: Card, slotIndex: number) {
    setCardSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = card;
      return next;
    });
  }

  function removeCard(slotIndex: number) {
    setCardSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }

  function placeOperator(diceIndex: number, formulaSlot: number) {
    setOpSlots((prev) => {
      const next = [...prev];
      next[formulaSlot] = diceIndex;
      return next;
    });
  }

  function removeOperator(formulaSlot: number) {
    setOpSlots((prev) => {
      const next = [...prev];
      next[formulaSlot] = null;
      return next;
    });
  }

  function resetSlots() {
    setCardSlots([null, null, null, null]);
    setOpSlots([null, null, null]);
  }

  // opSlots의 주사위 인덱스를 실제 연산자 값으로 변환
  const resolvedOps = opSlots.map((idx) => (idx !== null ? currentOperators[idx] : null));

  const allCardsFilled = cardSlots.every(Boolean);
  const allOpsFilled = resolvedOps.every(Boolean);
  const canSubmit = allCardsFilled && allOpsFilled;

  let previewResult: number | null | undefined = undefined;
  let previewFormula = '';
  if (canSubmit) {
    const nums = cardSlots.map((c) => c!.value) as [number, number, number, number];
    const ops = resolvedOps as [Operator, Operator, Operator];
    const result = evaluate(nums, ops);
    previewResult = result.value;
    previewFormula = result.formula;
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const nums = cardSlots.map((c) => c!.value) as [number, number, number, number];
    const ops = resolvedOps as [Operator, Operator, Operator];
    const submission: FormulaSubmission = { cardValues: nums, operators: ops };
    socket.emit('game:submit', submission, () => {});
    resetSlots();
  }

  return (
    <div className="bg-lottery-card rounded-xl p-4 border-2 border-lottery-gold shadow-[0_0_20px_rgba(245,166,35,0.3)]">
      <h2 className="text-lottery-gold text-sm font-bold mb-4 tracking-wider uppercase">
        ✏️ 수식 만들기 (버저 획득!)
      </h2>

      {/* 수식 슬롯 */}
      <div className="flex items-center gap-1 justify-center mb-4 flex-wrap">
        {[0, 1, 2, 3].map((i) => (
          <div key={`slot-${i}`} className="flex items-center gap-1">
            <CardSlot card={cardSlots[i]} onRemove={() => removeCard(i)} />
            {i < 3 && (
              <OperatorSlot
                op={resolvedOps[i] ?? null}
                onRemove={() => removeOperator(i)}
              />
            )}
          </div>
        ))}
      </div>

      {/* 카드 패 */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-2">카드 선택 (4장)</p>
        <div className="flex flex-wrap gap-2">
          {myPlayer.cards.map((card) => {
            const used = usedCardIds.has(card.id);
            const emptySlot = cardSlots.findIndex((s) => s === null);
            return (
              <button
                key={card.id}
                disabled={used || emptySlot === -1}
                onClick={() => !used && emptySlot !== -1 && placeCard(card, emptySlot)}
                className={`
                  w-10 h-12 rounded-lg border-2 font-bold text-lg transition-all
                  ${
                    used
                      ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-lottery-panel border-lottery-gold text-white hover:bg-lottery-gold hover:text-lottery-dark cursor-pointer active:scale-95'
                  }
                `}
              >
                {card.value}
              </button>
            );
          })}
        </div>
      </div>

      {/* 연산자 선택 */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-2">연산자 배치</p>
        <div className="flex gap-2">
          {currentOperators.map((op, diceIdx) => {
            // 이 주사위가 이미 어느 수식 슬롯에 배치됐는지 확인
            const placed = usedDiceIndices.has(diceIdx);
            const emptyOpSlot = opSlots.findIndex((s) => s === null);
            return (
              <button
                key={diceIdx}
                disabled={placed || emptyOpSlot === -1}
                onClick={() => !placed && emptyOpSlot !== -1 && placeOperator(diceIdx, emptyOpSlot)}
                className={`
                  w-10 h-10 rounded-lg border-2 font-bold text-lg transition-all
                  ${OPERATOR_COLORS[op]}
                  ${
                    placed
                      ? 'opacity-30 cursor-not-allowed bg-gray-900'
                      : 'bg-lottery-dark hover:bg-lottery-panel cursor-pointer active:scale-95'
                  }
                `}
              >
                {OPERATOR_DISPLAY[op]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 미리보기 */}
      {canSubmit && (
        <div className="mb-4 text-center">
          <span className="text-gray-300 font-mono text-sm">{previewFormula} = </span>
          {previewResult !== null ? (
            <span className="text-lottery-gold font-bold text-lg">{previewResult}</span>
          ) : (
            <span className="text-red-400 font-bold">무효</span>
          )}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={resetSlots}
          className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors"
        >
          초기화
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || previewResult === null}
          className={`
            flex-2 flex-grow py-2 rounded-lg font-bold text-sm transition-all
            ${
              canSubmit && previewResult !== null
                ? 'bg-lottery-gold text-lottery-dark hover:brightness-110 active:scale-95 shadow-md'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          제출
        </button>
      </div>
    </div>
  );
}

function CardSlot({ card, onRemove }: { card: Card | null; onRemove: () => void }) {
  return (
    <div
      onClick={card ? onRemove : undefined}
      className={`
        w-10 h-12 rounded-lg border-2 font-bold text-lg flex items-center justify-center
        transition-all
        ${
          card
            ? 'bg-lottery-panel border-lottery-gold text-white cursor-pointer hover:border-red-400'
            : 'bg-lottery-dark border-dashed border-gray-600 text-gray-600'
        }
      `}
    >
      {card ? card.value : '?'}
    </div>
  );
}

function OperatorSlot({ op, onRemove }: { op: Operator | null; onRemove: () => void }) {
  return (
    <div
      onClick={op ? onRemove : undefined}
      className={`
        w-8 h-8 rounded font-bold flex items-center justify-center text-sm border
        transition-all
        ${
          op
            ? `bg-lottery-dark cursor-pointer ${OPERATOR_COLORS[op]}`
            : 'border-dashed border-gray-700 text-gray-700'
        }
      `}
    >
      {op ? OPERATOR_DISPLAY[op] : '·'}
    </div>
  );
}
