export type Operator = '+' | '-' | '×' | '÷' | '^' | '★';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface Card {
  id: string;
  value: CardValue;
}

export interface PlayerState {
  id: string;
  name: string;
  cards: Card[];
  completedNumbers: number[];
  canBuzz: boolean;
  itemUsesThisRound: number; // 이번 라운드 카드 교체 사용 횟수
  isConnected: boolean;
}

export type GamePhase = 'LOBBY' | 'ROLLING' | 'BUZZED' | 'GAME_OVER';

export interface GameRoomState {
  id: string;
  hostId: string;
  phase: GamePhase;
  winningNumbers: number[];
  remainingNumbers: number[];
  currentOperators: Operator[] | null;
  players: PlayerSnapshot[];
  buzzedPlayerId: string | null;
  buzzTimerEnd: number | null;
  roundTimerEnd: number | null;
  winner: string | null;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  cards: Card[];
  completedNumbers: number[];
  canBuzz: boolean;
  itemUsesThisRound: number;
  isConnected: boolean;
}

// 수식 제출 페이로드 — 카드 ID 기반으로 정확한 카드 추적
export interface FormulaSubmission {
  cardIds: [string, string, string, string]; // 선택한 카드 4장의 ID
  operators: [Operator, Operator, Operator];
}

// ── Socket.io 이벤트 타입 ──────────────────────────────────────

export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, cb: (res: RoomCreateResponse) => void) => void;
  'room:join': (payload: { roomId: string; playerName: string }, cb: (res: RoomJoinResponse) => void) => void;
  'game:start': (cb: (res: AckResponse) => void) => void;
  'game:buzz': (payload: { clientTimestamp: number }) => void;
  'game:submit': (payload: FormulaSubmission, cb: (res: SubmitResponse) => void) => void;
  'game:use_item': (payload: { cardId: string }, cb: (res: AckResponse) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: GameRoomState) => void;
  'game:dice_rolled': (payload: { operators: Operator[]; roundTimerEnd: number }) => void;
  'game:buzz_granted': (payload: { playerId: string; playerName: string; buzzTimerEnd: number }) => void;
  'game:submit_result': (payload: SubmitResultPayload) => void;
  'game:dice_reset': (payload: { reason: 'timeout' | 'success' | 'fail' }) => void;
  'game:over': (payload: { winnerId: string; winnerName: string }) => void;
  'error': (payload: { message: string }) => void;
}

// ── ACK 응답 타입 ─────────────────────────────────────────────

export interface AckResponse {
  ok: boolean;
  message?: string;
}

export interface RoomCreateResponse extends AckResponse {
  roomId?: string;
  playerId?: string;
}

export interface RoomJoinResponse extends AckResponse {
  playerId?: string;
}

export interface SubmitResponse extends AckResponse {
  result?: number;
  matched?: boolean;
}

export interface SubmitResultPayload {
  playerId: string;
  playerName: string;
  formula: string;
  result: number | null;
  success: boolean;
  matchedNumber?: number;
}

// ── 게임 상수 ─────────────────────────────────────────────────

export const GAME_CONFIG = {
  WINNING_NUMBER_COUNT: 6,
  WINNING_NUMBER_MIN: 1,
  WINNING_NUMBER_MAX: 45,
  CARDS_PER_PLAYER: 8,
  CARDS_IN_FORMULA: 4,
  CARDS_REPLACED_ON_SUCCESS: 4,
  CARD_VALUE_MIN: 1 as CardValue,
  CARD_VALUE_MAX: 6 as CardValue,
  OPERATORS: ['+', '-', '×', '÷', '^', '★'] as Operator[],
  BUZZ_TIMEOUT_MS: 30_000,
  ROUND_TIMEOUT_MS: 180_000,
  ITEM_USES_PER_ROUND: 1000, // 라운드당 카드 교체 최대 횟수
} as const;
