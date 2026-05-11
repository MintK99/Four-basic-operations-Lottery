import { useEffect } from 'react';
import socket from '../socket';
import { useGameStore } from '../store/gameStore';

export function useSocketEvents() {
  const { setRoomState, addNotification } = useGameStore();

  useEffect(() => {
    socket.on('room:state', (state) => {
      setRoomState(state);
    });

    socket.on('game:submit_result', (payload) => {
      if (payload.success) {
        addNotification(
          `✅ ${payload.playerName}: ${payload.formula} = ${payload.matchedNumber} 성공!`,
          'success'
        );
      } else {
        addNotification(
          `❌ ${payload.playerName}: ${payload.formula} = ${payload.result ?? '무효'} 실패`,
          'error'
        );
      }
    });

    socket.on('game:dice_reset', ({ reason }) => {
      const msgs: Record<typeof reason, string> = {
        timeout: '⏰ 시간 초과! 주사위를 다시 굴립니다.',
        success: '🎉 성공! 주사위를 다시 굴립니다.',
        fail: '❌ 실패! 주사위를 다시 굴립니다.',
      };
      addNotification(msgs[reason], 'info');
    });

    socket.on('game:over', ({ winnerName }) => {
      addNotification(`🏆 ${winnerName} 승리!`, 'success');
    });

    socket.on('error', ({ message }) => {
      addNotification(message, 'error');
    });

    return () => {
      socket.off('room:state');
      socket.off('game:submit_result');
      socket.off('game:dice_reset');
      socket.off('game:over');
      socket.off('error');
    };
  }, [setRoomState, addNotification]);
}
