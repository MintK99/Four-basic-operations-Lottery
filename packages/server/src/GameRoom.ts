import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  CardValue,
  GamePhase,
  GameRoomState,
  Operator,
  PlayerSnapshot,
  FormulaSubmission,
  SubmitResultPayload,
  GAME_CONFIG,
} from '@lottery/shared';
import { evaluate } from '@lottery/shared';

export interface Player {
  id: string;
  name: string;
  cards: Card[];
  completedNumbers: number[];
  canBuzz: boolean;
  itemCooldownUntil: number;
  isConnected: boolean;
  socketId: string;
}

export type GameRoomEvent =
  | { type: 'dice_rolled'; operators: Operator[]; roundTimerEnd: number }
  | { type: 'buzz_granted'; playerId: string; playerName: string; buzzTimerEnd: number }
  | { type: 'submit_result'; payload: SubmitResultPayload }
  | { type: 'dice_reset'; reason: 'timeout' | 'success' | 'fail' }
  | { type: 'game_over'; winnerId: string; winnerName: string }
  | { type: 'state_changed' };

export type EventListener = (event: GameRoomEvent) => void;

export class GameRoom {
  readonly id: string;
  readonly hostId: string;
  private phase: GamePhase = 'LOBBY';
  private winningNumbers: number[] = [];
  private remainingNumbers: number[] = [];
  private currentOperators: Operator[] | null = null;
  private players: Map<string, Player> = new Map();
  private buzzedPlayerId: string | null = null;
  private buzzTimerEnd: number | null = null;
  private roundTimerEnd: number | null = null;
  private winner: string | null = null;

  private buzzTimer: ReturnType<typeof setTimeout> | null = null;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: EventListener[] = [];

  constructor(hostId: string) {
    this.id = uuidv4().slice(0, 6).toUpperCase();
    this.hostId = hostId;
  }

  // ── 이벤트 리스너 ─────────────────────────────────────────

  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GameRoomEvent): void {
    for (const l of this.listeners) l(event);
  }

  // ── 플레이어 관리 ─────────────────────────────────────────

  addPlayer(socketId: string, playerId: string, name: string): Player {
    const player: Player = {
      id: playerId,
      name,
      cards: this.dealCards(GAME_CONFIG.CARDS_PER_PLAYER),
      completedNumbers: [],
      canBuzz: true,
      itemCooldownUntil: 0,
      isConnected: true,
      socketId,
    };
    this.players.set(playerId, player);
    this.emit({ type: 'state_changed' });
    return player;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.isConnected = false;
      this.emit({ type: 'state_changed' });
    }
  }

  reconnectPlayer(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.socketId = socketId;
      player.isConnected = true;
      this.emit({ type: 'state_changed' });
    }
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getConnectedPlayerCount(): number {
    return [...this.players.values()].filter((p) => p.isConnected).length;
  }

  isEmpty(): boolean {
    return this.getConnectedPlayerCount() === 0;
  }

  // ── 게임 시작 ─────────────────────────────────────────────

  startGame(): void {
    if (this.phase !== 'LOBBY') return;

    this.winningNumbers = this.generateWinningNumbers();
    this.remainingNumbers = [...this.winningNumbers];
    this.phase = 'ROLLING';

    // 모든 플레이어에게 카드 초기 지급
    for (const player of this.players.values()) {
      player.cards = this.dealCards(GAME_CONFIG.CARDS_PER_PLAYER);
      player.completedNumbers = [];
      player.canBuzz = true;
      player.itemCooldownUntil = 0;
    }

    this.emit({ type: 'state_changed' });
    this.rollDice();
  }

  // ── 주사위 굴리기 ─────────────────────────────────────────

  rollDice(): void {
    if (this.phase !== 'ROLLING') return;

    this.currentOperators = this.drawOperators();
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;

    // 모든 플레이어의 canBuzz 초기화
    for (const player of this.players.values()) {
      player.canBuzz = true;
    }

    const roundTimerEnd = Date.now() + GAME_CONFIG.ROUND_TIMEOUT_MS;
    this.roundTimerEnd = roundTimerEnd;

    this.clearTimers();
    this.roundTimer = setTimeout(() => this.onRoundTimeout(), GAME_CONFIG.ROUND_TIMEOUT_MS);

    this.emit({ type: 'dice_rolled', operators: this.currentOperators, roundTimerEnd });
    this.emit({ type: 'state_changed' });
  }

  // ── 버저 처리 ─────────────────────────────────────────────

  handleBuzz(playerId: string): void {
    if (this.phase !== 'ROLLING') return;
    if (this.buzzedPlayerId !== null) return; // 이미 버저 획득자 있음

    const player = this.players.get(playerId);
    if (!player || !player.canBuzz) return;

    this.phase = 'BUZZED';
    this.buzzedPlayerId = playerId;

    const buzzTimerEnd = Date.now() + GAME_CONFIG.BUZZ_TIMEOUT_MS;
    this.buzzTimerEnd = buzzTimerEnd;

    this.clearTimers();
    this.buzzTimer = setTimeout(() => this.onBuzzTimeout(), GAME_CONFIG.BUZZ_TIMEOUT_MS);

    this.emit({
      type: 'buzz_granted',
      playerId,
      playerName: player.name,
      buzzTimerEnd,
    });
    this.emit({ type: 'state_changed' });
  }

  // ── 수식 제출 ─────────────────────────────────────────────

  handleSubmit(playerId: string, submission: FormulaSubmission): SubmitResultPayload {
    const player = this.players.get(playerId);

    if (!player || this.phase !== 'BUZZED' || this.buzzedPlayerId !== playerId) {
      return {
        playerId,
        playerName: player?.name ?? '',
        formula: '',
        result: null,
        success: false,
      };
    }

    const { cardValues, operators } = submission;
    const evalResult = evaluate(cardValues, operators);
    const formula = evalResult.formula;
    const result = evalResult.value;

    const matchedNumber =
      result !== null && this.remainingNumbers.includes(result) ? result : undefined;
    const success = matchedNumber !== undefined;

    const payload: SubmitResultPayload = {
      playerId,
      playerName: player.name,
      formula,
      result,
      success,
      matchedNumber,
    };

    if (success && matchedNumber !== undefined) {
      // 당첨번호 제거
      this.remainingNumbers = this.remainingNumbers.filter((n) => n !== matchedNumber);
      player.completedNumbers.push(matchedNumber);

      // 사용한 카드 4장 교체
      const usedValues = new Set(cardValues);
      let replaced = 0;
      player.cards = player.cards.filter((c) => {
        if (replaced < GAME_CONFIG.CARDS_REPLACED_ON_SUCCESS && usedValues.has(c.value)) {
          usedValues.delete(c.value);
          replaced++;
          return false;
        }
        return true;
      });
      const newCards = this.dealCards(GAME_CONFIG.CARDS_REPLACED_ON_SUCCESS);
      player.cards.push(...newCards);

      this.clearTimers();

      // 승리 조건 확인
      if (player.completedNumbers.length >= GAME_CONFIG.WINNING_NUMBER_COUNT) {
        this.phase = 'GAME_OVER';
        this.winner = playerId;
        this.emit({ type: 'submit_result', payload });
        this.emit({ type: 'game_over', winnerId: playerId, winnerName: player.name });
        this.emit({ type: 'state_changed' });
        return payload;
      }

      // 다음 라운드
      this.phase = 'ROLLING';
      this.buzzedPlayerId = null;
      this.buzzTimerEnd = null;
      this.emit({ type: 'submit_result', payload });
      this.emit({ type: 'dice_reset', reason: 'success' });
      this.emit({ type: 'state_changed' });
      this.rollDice();
    } else {
      // 실패: 30초 타이머 내에서 재시도 가능 (BUZZED 상태 유지)
      this.emit({ type: 'submit_result', payload });
      this.emit({ type: 'state_changed' });
    }

    return payload;
  }

  // ── 아이템: 카드 교체 ─────────────────────────────────────

  handleUseItem(playerId: string, cardId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    const now = Date.now();
    if (player.itemCooldownUntil > now) return false;

    const cardIndex = player.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return false;

    // 카드 교체
    player.cards.splice(cardIndex, 1);
    const [newCard] = this.dealCards(1);
    player.cards.push(newCard);
    player.itemCooldownUntil = now + GAME_CONFIG.ITEM_COOLDOWN_MS;

    this.emit({ type: 'state_changed' });
    return true;
  }

  // ── 타이머 콜백 ───────────────────────────────────────────

  private onBuzzTimeout(): void {
    if (this.phase !== 'BUZZED') return;

    // 버저 시간 초과: 주사위 유지, 누구나 다시 버저 가능
    this.phase = 'ROLLING';
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;

    this.emit({ type: 'dice_reset', reason: 'timeout' });
    this.emit({ type: 'state_changed' });

    // 라운드 타이머 재개
    const remainingMs = this.roundTimerEnd ? this.roundTimerEnd - Date.now() : 0;
    if (remainingMs > 0) {
      this.roundTimer = setTimeout(() => this.onRoundTimeout(), remainingMs);
    } else {
      this.onRoundTimeout();
    }
  }

  private onRoundTimeout(): void {
    if (this.phase === 'GAME_OVER') return;
    this.phase = 'ROLLING';
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;
    this.roundTimerEnd = null;
    this.currentOperators = null;

    this.emit({ type: 'dice_reset', reason: 'timeout' });
    this.emit({ type: 'state_changed' });
    this.rollDice();
  }

  // ── 카드/연산자 유틸 ─────────────────────────────────────

  private dealCards(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      const value = (Math.floor(Math.random() * GAME_CONFIG.CARD_VALUE_MAX) + 1) as CardValue;
      cards.push({ id: uuidv4(), value });
    }
    return cards;
  }

  private drawOperators(): Operator[] {
    const ops = [...GAME_CONFIG.OPERATORS];
    const result: Operator[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * ops.length);
      result.push(ops[idx]);
      // 복원 추출 (같은 연산자 중복 가능)
    }
    return result;
  }

  private generateWinningNumbers(): number[] {
    const nums = new Set<number>();
    while (nums.size < GAME_CONFIG.WINNING_NUMBER_COUNT) {
      const n =
        Math.floor(Math.random() * (GAME_CONFIG.WINNING_NUMBER_MAX - GAME_CONFIG.WINNING_NUMBER_MIN + 1)) +
        GAME_CONFIG.WINNING_NUMBER_MIN;
      nums.add(n);
    }
    return [...nums].sort((a, b) => a - b);
  }

  private clearTimers(): void {
    if (this.buzzTimer) {
      clearTimeout(this.buzzTimer);
      this.buzzTimer = null;
    }
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  // ── 상태 스냅샷 ───────────────────────────────────────────

  toSnapshot(): GameRoomState {
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      cards: p.cards,
      completedNumbers: p.completedNumbers,
      canBuzz: p.canBuzz,
      itemCooldownUntil: p.itemCooldownUntil,
      isConnected: p.isConnected,
    }));

    return {
      id: this.id,
      hostId: this.hostId,
      phase: this.phase,
      winningNumbers: this.winningNumbers,
      remainingNumbers: this.remainingNumbers,
      currentOperators: this.currentOperators,
      players,
      buzzedPlayerId: this.buzzedPlayerId,
      buzzTimerEnd: this.buzzTimerEnd,
      roundTimerEnd: this.roundTimerEnd,
      winner: this.winner,
    };
  }

  destroy(): void {
    this.clearTimers();
    this.listeners = [];
  }
}
