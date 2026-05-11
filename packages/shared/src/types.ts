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
  completedNumbers: number[]; // 완성한 당첨번호 값 목록
  canBuzz: boolean;           // 이번 라운드 버저 가능 여부
  itemCooldownUntil: number;  // 카드 교체 아이템 쿨다운 만료 시각 (ms)
  isConnected: boolean;
}

export type GamePhase = 'LOBBY' | 'ROLLING' | 'BUZZED' | 'GAME_OVER';

export interface GameRoomState {
  id: string;
  hostId: string;
  phase: GamePhase;
  winningNumbers: number[];         // 6개 당첨번호 (1~45)
  remainingNumbers: number[];       // 아직 완성 안 된 당첨번호
  currentOperators: Operator[] | null; // 굴린 주사위 3개
  players: PlayerSnapshot[];
  buzzedPlayerId: string | null;
  buzzTimerEnd: number | null;      // 15초 타이머 만료 Unix ms
  roundTimerEnd: number | null;     // 3분 타이머 만료 Unix ms
  winner: string | null;            // 승자 플레이어 id
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  cards: Card[];
  completedNumbers: number[];
  canBuzz: boolean;
  itemCooldownUntil: number;
  isConnected: boolean;
}

// 수식 제출 페이로드
export interface FormulaSubmission {
  // 카드 4장 순서 (n1 op1 n2 op2 n3 op3 n4 형태)
  cardValues: [number, number, number, number];
  // 주사위 3개를 배치한 순서
  operators: [Operator, Operator, Operator];
}

// ── Socket.io 이벤트 타입 ──────────────────────────────────────

// Client → Server
export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, cb: (res: RoomCreateResponse) => void) => void;
  'room:join': (payload: { roomId: string; playerName: string }, cb: (res: RoomJoinResponse) => void) => void;
  'game:start': (cb: (res: AckResponse) => void) => void;
  'game:buzz': (payload: { clientTimestamp: number }) => void;
  'game:submit': (payload: FormulaSubmission, cb: (res: SubmitResponse) => void) => void;
  'game:use_item': (payload: { cardId: string }, cb: (res: AckResponse) => void) => void;
}

// Server → Client
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
  ITEM_COOLDOWN_MS: 30 * 60_000,
} as const;
