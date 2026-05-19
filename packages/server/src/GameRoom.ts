import { v4 as uuidv4 } from 'uuid';
import {
  Card,
  CardValue,
  GameDifficulty,
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
  itemUsesThisRound: number;
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

interface OperatorCandidateScore {
  operators: [Operator, Operator, Operator];
  score: number;
  matchedNumberCount: number;
  formulaCount: number;
  playerCount: number;
}

export class GameRoom {
  readonly id: string;
  readonly hostId: string;
  readonly difficulty: GameDifficulty;
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

  constructor(hostId: string, difficulty: GameDifficulty = 'easy') {
    this.id = uuidv4().slice(0, 6).toUpperCase();
    this.hostId = hostId;
    this.difficulty = difficulty;
  }

  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GameRoomEvent): void {
    for (const l of this.listeners) l(event);
  }

  addPlayer(socketId: string, playerId: string, name: string): Player {
    const player: Player = {
      id: playerId,
      name,
      cards: this.dealCards(GAME_CONFIG.CARDS_PER_PLAYER),
      completedNumbers: [],
      canBuzz: true,
      itemUsesThisRound: 0,
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

  startGame(): void {
    if (this.phase !== 'LOBBY' && this.phase !== 'GAME_OVER') return;

    this.clearTimers();
    this.winningNumbers = this.generateWinningNumbers();
    this.remainingNumbers = [...this.winningNumbers];
    this.currentOperators = null;
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;
    this.roundTimerEnd = null;
    this.winner = null;
    this.phase = 'ROLLING';

    for (const player of this.players.values()) {
      player.cards = this.dealCards(GAME_CONFIG.CARDS_PER_PLAYER);
      player.completedNumbers = [];
      player.canBuzz = true;
      player.itemUsesThisRound = 0;
    }

    this.emit({ type: 'state_changed' });
    this.rollDice();
  }

  rollDice(): void {
    if (this.phase !== 'ROLLING') return;

    this.currentOperators = this.drawOperators();
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;

    for (const player of this.players.values()) {
      player.canBuzz = true;
      player.itemUsesThisRound = 0;
    }

    const roundTimerEnd = Date.now() + GAME_CONFIG.ROUND_TIMEOUT_MS;
    this.roundTimerEnd = roundTimerEnd;

    this.clearTimers();
    this.roundTimer = setTimeout(() => this.onRoundTimeout(), GAME_CONFIG.ROUND_TIMEOUT_MS);

    this.emit({ type: 'dice_rolled', operators: this.currentOperators, roundTimerEnd });
    this.emit({ type: 'state_changed' });
  }

  handleBuzz(playerId: string): void {
    if (this.phase !== 'ROLLING') return;
    if (this.buzzedPlayerId !== null) return;

    const player = this.players.get(playerId);
    if (!player || !player.canBuzz) return;

    this.phase = 'BUZZED';
    this.buzzedPlayerId = playerId;

    const buzzTimerEnd = Date.now() + GAME_CONFIG.BUZZ_TIMEOUT_MS;
    this.buzzTimerEnd = buzzTimerEnd;

    this.clearTimers();
    this.buzzTimer = setTimeout(() => this.onBuzzTimeout(), GAME_CONFIG.BUZZ_TIMEOUT_MS);

    this.emit({ type: 'buzz_granted', playerId, playerName: player.name, buzzTimerEnd });
    this.emit({ type: 'state_changed' });
  }

  handleSubmit(playerId: string, submission: FormulaSubmission): SubmitResultPayload {
    const player = this.players.get(playerId);

    if (!player || this.phase !== 'BUZZED' || this.buzzedPlayerId !== playerId) {
      return { playerId, playerName: player?.name ?? '', formula: '', result: null, success: false };
    }

    const { cardIds, operators } = submission;

    if (!this.currentOperators || !this.operatorsMatchCurrentDice(operators)) {
      const payload = {
        playerId,
        playerName: player.name,
        formula: '허용되지 않은 연산자',
        result: null,
        success: false,
      };
      this.emit({ type: 'submit_result', payload });
      this.emit({ type: 'state_changed' });
      return payload;
    }

    if (new Set(cardIds).size !== GAME_CONFIG.CARDS_IN_FORMULA) {
      return { playerId, playerName: player.name, formula: '', result: null, success: false };
    }

    const cardMap = new Map(player.cards.map((c) => [c.id, c]));
    const usedCards = cardIds.map((id) => cardMap.get(id)).filter((c): c is Card => c !== undefined);

    if (usedCards.length !== GAME_CONFIG.CARDS_IN_FORMULA) {
      return { playerId, playerName: player.name, formula: '', result: null, success: false };
    }

    const cardValues = usedCards.map((c) => c.value) as [number, number, number, number];
    const evalResult = evaluate(cardValues, operators);
    const formula = evalResult.formula;
    const result = evalResult.value;

    const matchedNumber =
      result !== null && this.remainingNumbers.includes(result) ? result : undefined;
    const success = matchedNumber !== undefined;

    const payload: SubmitResultPayload = { playerId, playerName: player.name, formula, result, success, matchedNumber };

    if (success && matchedNumber !== undefined) {
      this.remainingNumbers = this.remainingNumbers.filter((n) => n !== matchedNumber);
      player.completedNumbers.push(matchedNumber);

      const usedCardIdSet = new Set(cardIds);
      player.cards = player.cards.filter((c) => !usedCardIdSet.has(c.id));
      player.cards.push(...this.dealCards(GAME_CONFIG.CARDS_REPLACED_ON_SUCCESS));

      this.clearTimers();

      if (player.completedNumbers.length >= GAME_CONFIG.WINNING_NUMBER_COUNT) {
        this.phase = 'GAME_OVER';
        this.winner = playerId;
        this.emit({ type: 'submit_result', payload });
        this.emit({ type: 'game_over', winnerId: playerId, winnerName: player.name });
        this.emit({ type: 'state_changed' });
        return payload;
      }

      this.phase = 'ROLLING';
      this.buzzedPlayerId = null;
      this.buzzTimerEnd = null;
      this.emit({ type: 'submit_result', payload });
      this.emit({ type: 'dice_reset', reason: 'success' });
      this.emit({ type: 'state_changed' });
      this.rollDice();
    } else {
      this.emit({ type: 'submit_result', payload });
      this.emit({ type: 'state_changed' });
    }

    return payload;
  }

  forceRerollDice(): void {
    if (this.phase === 'LOBBY' || this.phase === 'GAME_OVER') return;
    this.clearTimers();
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;
    this.phase = 'ROLLING';
    this.rollDice();
  }

  forceRedrawNumbers(): void {
    if (this.phase === 'LOBBY' || this.phase === 'GAME_OVER') return;
    this.winningNumbers = this.generateWinningNumbers();
    this.remainingNumbers = [...this.winningNumbers];
    for (const player of this.players.values()) {
      player.completedNumbers = [];
    }
    this.emit({ type: 'state_changed' });
  }

  handleUseItem(playerId: string, cardId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    if (player.itemUsesThisRound >= GAME_CONFIG.ITEM_USES_PER_ROUND) return false;

    const cardIndex = player.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return false;

    player.cards.splice(cardIndex, 1);
    const [newCard] = this.dealCards(1);
    player.cards.push(newCard);
    player.itemUsesThisRound += 1;

    this.emit({ type: 'state_changed' });
    return true;
  }

  private onBuzzTimeout(): void {
    if (this.phase !== 'BUZZED') return;

    this.phase = 'ROLLING';
    this.buzzedPlayerId = null;
    this.buzzTimerEnd = null;

    this.emit({ type: 'dice_reset', reason: 'timeout' });
    this.emit({ type: 'state_changed' });

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

  private dealCards(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      const value = (Math.floor(Math.random() * GAME_CONFIG.CARD_VALUE_MAX) + 1) as CardValue;
      cards.push({ id: uuidv4(), value });
    }
    return cards;
  }

  private drawOperators(): [Operator, Operator, Operator] {
    const candidates = this.getAllOperatorRolls()
      .map((operators) => this.scoreOperators(operators))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return this.drawRandomOperators();
    }

    return this.pickCandidateByDifficulty(candidates).operators;
  }

  private drawRandomOperators(): [Operator, Operator, Operator] {
    return [
      this.randomOperator(),
      this.randomOperator(),
      this.randomOperator(),
    ];
  }

  private randomOperator(): Operator {
    const idx = Math.floor(Math.random() * GAME_CONFIG.OPERATORS.length);
    return GAME_CONFIG.OPERATORS[idx];
  }

  private getAllOperatorRolls(): [Operator, Operator, Operator][] {
    const rolls: [Operator, Operator, Operator][] = [];
    for (const first of GAME_CONFIG.OPERATORS) {
      for (const second of GAME_CONFIG.OPERATORS) {
        for (const third of GAME_CONFIG.OPERATORS) {
          rolls.push([first, second, third]);
        }
      }
    }
    return rolls;
  }

  private scoreOperators(operators: [Operator, Operator, Operator]): OperatorCandidateScore {
    const matchedNumbers = new Set<number>();
    const playersWithAnswer = new Set<string>();
    let formulaCount = 0;
    const operatorOrders = this.uniquePermutations(operators, GAME_CONFIG.CARDS_IN_FORMULA - 1) as [Operator, Operator, Operator][];

    for (const player of this.players.values()) {
      const cardOrders = this.permutations(player.cards, GAME_CONFIG.CARDS_IN_FORMULA) as [Card, Card, Card, Card][];
      for (const cards of cardOrders) {
        const values = cards.map((card) => card.value) as [number, number, number, number];
        for (const operatorOrder of operatorOrders) {
          const { value } = evaluate(values, operatorOrder);
          if (value !== null && this.remainingNumbers.includes(value)) {
            matchedNumbers.add(value);
            playersWithAnswer.add(player.id);
            formulaCount += 1;
          }
        }
      }
    }

    return {
      operators,
      matchedNumberCount: matchedNumbers.size,
      formulaCount,
      playerCount: playersWithAnswer.size,
      score: matchedNumbers.size * 100 + playersWithAnswer.size * 40 + formulaCount,
    };
  }

  private pickCandidateByDifficulty(candidates: OperatorCandidateScore[]): OperatorCandidateScore {
    if (this.difficulty === 'easy') {
      const maxScore = candidates[0].score;
      const pool = candidates.filter((candidate) => candidate.score >= maxScore * 0.65).slice(0, 30);
      return this.pickRandom(pool.length > 0 ? pool : candidates);
    }

    if (this.difficulty === 'normal') {
      const start = Math.floor(candidates.length * 0.2);
      const end = Math.max(start + 1, Math.floor(candidates.length * 0.7));
      return this.pickRandom(candidates.slice(start, end));
    }

    const start = Math.floor(candidates.length * 0.65);
    return this.pickRandom(candidates.slice(start));
  }

  private operatorsMatchCurrentDice(operators: [Operator, Operator, Operator]): boolean {
    if (!this.currentOperators || this.currentOperators.length !== operators.length) return false;
    const submitted = [...operators].sort();
    const current = [...this.currentOperators].sort();
    return submitted.every((operator, index) => operator === current[index]);
  }

  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  private uniquePermutations<T>(arr: T[], r: number): T[][] {
    const seen = new Set<string>();
    return this.permutations(arr, r).filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private permutations<T>(arr: T[], r: number): T[][] {
    if (r === 0) return [[]];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of this.permutations(rest, r - 1)) {
        result.push([arr[i], ...perm]);
      }
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
    if (this.buzzTimer) { clearTimeout(this.buzzTimer); this.buzzTimer = null; }
    if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
  }

  toSnapshot(): GameRoomState {
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      cards: p.cards,
      completedNumbers: p.completedNumbers,
      canBuzz: p.canBuzz,
      itemUsesThisRound: p.itemUsesThisRound,
      isConnected: p.isConnected,
    }));

    return {
      id: this.id,
      hostId: this.hostId,
      difficulty: this.difficulty,
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
