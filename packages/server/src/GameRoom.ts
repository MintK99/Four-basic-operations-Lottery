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
  isBot: boolean;
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
  playerCount: number;
}

interface AiProfile {
  minBuzzDelayMs: number;
  maxBuzzDelayMs: number;
  attemptChance: number;
  minSubmitDelayMs: number;
  maxSubmitDelayMs: number;
}

const AI_PROFILES: Record<GameDifficulty, AiProfile> = {
  easy: {
    minBuzzDelayMs: 18_000,
    maxBuzzDelayMs: 28_000,
    attemptChance: 0.45,
    minSubmitDelayMs: 1_500,
    maxSubmitDelayMs: 2_800,
  },
  normal: {
    minBuzzDelayMs: 10_000,
    maxBuzzDelayMs: 18_000,
    attemptChance: 0.72,
    minSubmitDelayMs: 1_000,
    maxSubmitDelayMs: 2_000,
  },
  hard: {
    minBuzzDelayMs: 5_000,
    maxBuzzDelayMs: 11_000,
    attemptChance: 0.95,
    minSubmitDelayMs: 600,
    maxSubmitDelayMs: 1_400,
  },
};

const AI_NAMES: Record<GameDifficulty, string> = {
  easy: 'AI 루키',
  normal: 'AI 챌린저',
  hard: 'AI 마스터',
};

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
  private aiBuzzTimer: ReturnType<typeof setTimeout> | null = null;
  private aiSubmitTimer: ReturnType<typeof setTimeout> | null = null;
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
    for (const listener of this.listeners) listener(event);
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
      isBot: false,
      socketId,
    };
    this.players.set(playerId, player);
    this.emit({ type: 'state_changed' });
    return player;
  }

  addAiPlayer(): Player {
    const player: Player = {
      id: `AI-${uuidv4()}`,
      name: AI_NAMES[this.difficulty],
      cards: this.dealCards(GAME_CONFIG.CARDS_PER_PLAYER),
      completedNumbers: [],
      canBuzz: true,
      itemUsesThisRound: 0,
      isConnected: true,
      isBot: true,
      socketId: '',
    };
    this.players.set(player.id, player);
    this.emit({ type: 'state_changed' });
    return player;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player && !player.isBot) {
      player.isConnected = false;
      this.emit({ type: 'state_changed' });
    }
  }

  reconnectPlayer(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (player && !player.isBot) {
      player.socketId = socketId;
      player.isConnected = true;
      this.emit({ type: 'state_changed' });
    }
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getConnectedPlayerCount(): number {
    return [...this.players.values()].filter((player) => player.isConnected).length;
  }

  isEmpty(): boolean {
    return ![...this.players.values()].some((player) => !player.isBot && player.isConnected);
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
    this.scheduleAiAttempt();
  }

  handleBuzz(playerId: string): void {
    if (this.phase !== 'ROLLING' || this.buzzedPlayerId !== null) return;

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
      const payload: SubmitResultPayload = {
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

    const cardMap = new Map(player.cards.map((card) => [card.id, card]));
    const usedCards = cardIds.map((id) => cardMap.get(id)).filter((card): card is Card => card !== undefined);

    if (usedCards.length !== GAME_CONFIG.CARDS_IN_FORMULA) {
      return { playerId, playerName: player.name, formula: '', result: null, success: false };
    }

    const cardValues = usedCards.map((card) => card.value) as [number, number, number, number];
    const evalResult = evaluate(cardValues, operators);
    const formula = evalResult.formula;
    const result = evalResult.value;

    const matchedNumber = result !== null && this.remainingNumbers.includes(result) ? result : undefined;
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
      this.remainingNumbers = this.remainingNumbers.filter((number) => number !== matchedNumber);
      player.completedNumbers.push(matchedNumber);

      const usedCardIdSet = new Set(cardIds);
      player.cards = player.cards.filter((card) => !usedCardIdSet.has(card.id));
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
    this.clearTimers();
    this.winningNumbers = this.generateWinningNumbers();
    this.remainingNumbers = [...this.winningNumbers];
    for (const player of this.players.values()) {
      player.completedNumbers = [];
    }
    this.phase = 'ROLLING';
    this.rollDice();
  }

  handleUseItem(playerId: string, cardId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return false;
    if (player.itemUsesThisRound >= GAME_CONFIG.ITEM_USES_PER_ROUND) return false;

    const cardIndex = player.cards.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) return false;

    player.cards.splice(cardIndex, 1);
    const [newCard] = this.dealCards(1);
    player.cards.push(newCard);
    player.itemUsesThisRound += 1;

    this.emit({ type: 'state_changed' });
    return true;
  }

  private scheduleAiAttempt(): void {
    const aiPlayer = [...this.players.values()].find((player) => player.isBot);
    if (!aiPlayer || this.phase !== 'ROLLING' || !this.currentOperators) return;

    const profile = AI_PROFILES[this.difficulty];
    if (Math.random() > profile.attemptChance) return;

    const solutions = this.findSolutions(aiPlayer, this.currentOperators, 30);
    if (solutions.length === 0) return;

    const remainingRoundMs = this.roundTimerEnd ? this.roundTimerEnd - Date.now() : GAME_CONFIG.ROUND_TIMEOUT_MS;
    if (remainingRoundMs <= profile.minBuzzDelayMs) return;

    const maxDelay = Math.min(profile.maxBuzzDelayMs, remainingRoundMs - 1_000);
    const buzzDelay = this.randomBetween(profile.minBuzzDelayMs, maxDelay);
    const selectedSolution = this.pickRandom(solutions);

    this.aiBuzzTimer = setTimeout(() => {
      if (this.phase !== 'ROLLING' || this.buzzedPlayerId !== null) return;

      this.handleBuzz(aiPlayer.id);
      if (this.buzzedPlayerId !== aiPlayer.id) return;

      const submitDelay = this.randomBetween(profile.minSubmitDelayMs, profile.maxSubmitDelayMs);
      this.aiSubmitTimer = setTimeout(() => {
        if (this.phase === 'BUZZED' && this.buzzedPlayerId === aiPlayer.id) {
          this.handleSubmit(aiPlayer.id, selectedSolution);
        }
      }, submitDelay);
    }, buzzDelay);
  }

  private findSolutions(player: Player, operators: Operator[], limit: number): FormulaSubmission[] {
    const solutions: FormulaSubmission[] = [];
    const seen = new Set<string>();
    const cardOrders = this.permutations(player.cards, GAME_CONFIG.CARDS_IN_FORMULA) as [Card, Card, Card, Card][];
    const operatorOrders = this.uniquePermutations(operators, GAME_CONFIG.CARDS_IN_FORMULA - 1) as [Operator, Operator, Operator][];

    for (const cards of cardOrders) {
      const values = cards.map((card) => card.value) as [number, number, number, number];
      for (const operatorOrder of operatorOrders) {
        const { value, formula } = evaluate(values, operatorOrder);
        if (value === null || !this.remainingNumbers.includes(value)) continue;

        const key = `${formula}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        solutions.push({
          cardIds: cards.map((card) => card.id) as [string, string, string, string],
          operators: operatorOrder,
        });
        if (solutions.length >= limit) return solutions;
      }
    }

    return solutions;
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
      this.scheduleAiAttempt();
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

    if (candidates.length === 0) return this.drawRandomOperators();
    return this.pickCandidateByDifficulty(candidates).operators;
  }

  private drawRandomOperators(): [Operator, Operator, Operator] {
    return [this.randomOperator(), this.randomOperator(), this.randomOperator()];
  }

  private randomOperator(): Operator {
    const index = Math.floor(Math.random() * GAME_CONFIG.OPERATORS.length);
    return GAME_CONFIG.OPERATORS[index];
  }

  private getAllOperatorRolls(): [Operator, Operator, Operator][] {
    const rolls: [Operator, Operator, Operator][] = [];
    const seen = new Set<string>();

    for (const first of GAME_CONFIG.OPERATORS) {
      for (const second of GAME_CONFIG.OPERATORS) {
        for (const third of GAME_CONFIG.OPERATORS) {
          const roll = [first, second, third] as [Operator, Operator, Operator];
          const key = [...roll].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          rolls.push(roll);
        }
      }
    }

    return rolls;
  }

  private scoreOperators(operators: [Operator, Operator, Operator]): OperatorCandidateScore {
    const activePlayers = [...this.players.values()].filter((player) => player.isConnected);
    const matchedNumbers = new Set<number>();
    const solutionCounts: number[] = [];
    let formulaCount = 0;
    const operatorOrders = this.uniquePermutations(operators, GAME_CONFIG.CARDS_IN_FORMULA - 1) as [Operator, Operator, Operator][];

    for (const player of activePlayers) {
      let playerSolutions = 0;
      const cardOrders = this.permutations(player.cards, GAME_CONFIG.CARDS_IN_FORMULA) as [Card, Card, Card, Card][];

      for (const cards of cardOrders) {
        const values = cards.map((card) => card.value) as [number, number, number, number];
        for (const operatorOrder of operatorOrders) {
          const { value } = evaluate(values, operatorOrder);
          if (value !== null && this.remainingNumbers.includes(value)) {
            matchedNumbers.add(value);
            playerSolutions += 1;
            formulaCount += 1;
          }
        }
      }
      solutionCounts.push(playerSolutions);
    }

    const playersWithAnswer = solutionCounts.filter((count) => count > 0).length;
    const minSolutions = solutionCounts.length > 0 ? Math.min(...solutionCounts) : 0;
    const maxSolutions = solutionCounts.length > 0 ? Math.max(...solutionCounts) : 0;
    const solutionGap = maxSolutions - minSolutions;

    return {
      operators,
      playerCount: playersWithAnswer,
      score:
        matchedNumbers.size * 100 +
        playersWithAnswer * 300 +
        minSolutions * 4 +
        formulaCount -
        solutionGap * 2,
    };
  }

  private pickCandidateByDifficulty(candidates: OperatorCandidateScore[]): OperatorCandidateScore {
    const activePlayerCount = [...this.players.values()].filter((player) => player.isConnected).length;

    if (this.difficulty === 'easy') {
      const fairCandidates = candidates.filter((candidate) => candidate.playerCount === activePlayerCount);
      const pool = (fairCandidates.length > 0 ? fairCandidates : candidates).slice(0, 20);
      return this.pickRandom(pool);
    }

    if (this.difficulty === 'normal') {
      const coveredCandidates = candidates.filter((candidate) => candidate.playerCount >= Math.ceil(activePlayerCount / 2));
      const source = coveredCandidates.length > 0 ? coveredCandidates : candidates;
      const start = Math.floor(source.length * 0.2);
      const end = Math.max(start + 1, Math.floor(source.length * 0.65));
      return this.pickRandom(source.slice(start, end));
    }

    const start = Math.floor(candidates.length * 0.55);
    return this.pickRandom(candidates.slice(start));
  }

  private operatorsMatchCurrentDice(operators: [Operator, Operator, Operator]): boolean {
    if (!this.currentOperators || this.currentOperators.length !== operators.length) return false;
    const submitted = [...operators].sort();
    const current = [...this.currentOperators].sort();
    return submitted.every((operator, index) => operator === current[index]);
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
      for (const permutation of this.permutations(rest, r - 1)) {
        result.push([arr[i], ...permutation]);
      }
    }
    return result;
  }

  private generateWinningNumbers(): number[] {
    const numbers = new Set<number>();
    while (numbers.size < GAME_CONFIG.WINNING_NUMBER_COUNT) {
      const number =
        Math.floor(Math.random() * (GAME_CONFIG.WINNING_NUMBER_MAX - GAME_CONFIG.WINNING_NUMBER_MIN + 1)) +
        GAME_CONFIG.WINNING_NUMBER_MIN;
      numbers.add(number);
    }
    return [...numbers].sort((a, b) => a - b);
  }

  private clearTimers(): void {
    if (this.buzzTimer) clearTimeout(this.buzzTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.aiBuzzTimer) clearTimeout(this.aiBuzzTimer);
    if (this.aiSubmitTimer) clearTimeout(this.aiSubmitTimer);
    this.buzzTimer = null;
    this.roundTimer = null;
    this.aiBuzzTimer = null;
    this.aiSubmitTimer = null;
  }

  toSnapshot(): GameRoomState {
    const players: PlayerSnapshot[] = [...this.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      cards: player.cards,
      completedNumbers: player.completedNumbers,
      canBuzz: player.canBuzz,
      itemUsesThisRound: player.itemUsesThisRound,
      isConnected: player.isConnected,
      isBot: player.isBot,
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
