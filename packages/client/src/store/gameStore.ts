import { create } from 'zustand';
import { GameRoomState, Operator } from '@lottery/shared';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface GameStore {
  // 내 세션
  playerId: string | null;
  roomId: string | null;
  playerName: string;

  // 게임 상태
  roomState: GameRoomState | null;

  // UI 상태
  notifications: Notification[];
  lastSubmitFormula: string | null;

  // 액션
  setSession: (playerId: string, roomId: string) => void;
  setPlayerName: (name: string) => void;
  setRoomState: (state: GameRoomState) => void;
  addNotification: (message: string, type: Notification['type']) => void;
  removeNotification: (id: number) => void;
  setLastSubmitFormula: (formula: string | null) => void;
  reset: () => void;
}

let notifId = 0;

export const useGameStore = create<GameStore>((set) => ({
  playerId: null,
  roomId: null,
  playerName: '',
  roomState: null,
  notifications: [],
  lastSubmitFormula: null,

  setSession: (playerId, roomId) => set({ playerId, roomId }),
  setPlayerName: (name) => set({ playerName: name }),
  setRoomState: (state) => set({ roomState: state }),
  addNotification: (message, type) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: ++notifId, message, type },
      ].slice(-5),
    })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  setLastSubmitFormula: (formula) => set({ lastSubmitFormula: formula }),
  reset: () =>
    set({ playerId: null, roomId: null, roomState: null, notifications: [], lastSubmitFormula: null }),
}));

// 편의 셀렉터
export const useMyPlayer = () => {
  const { playerId, roomState } = useGameStore();
  return roomState?.players.find((p) => p.id === playerId) ?? null;
};

export const useCurrentOperators = (): Operator[] | null => {
  return useGameStore((s) => s.roomState?.currentOperators ?? null);
};
