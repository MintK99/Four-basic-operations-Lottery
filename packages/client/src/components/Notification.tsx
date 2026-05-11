import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

export function Notifications() {
  const { notifications, removeNotification } = useGameStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {notifications.map((n) => (
        <NotificationItem key={n.id} {...n} onClose={() => removeNotification(n.id)} />
      ))}
    </div>
  );
}

function NotificationItem({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg =
    type === 'success'
      ? 'bg-green-700 border-green-500'
      : type === 'error'
      ? 'bg-red-800 border-red-600'
      : 'bg-blue-800 border-blue-600';

  return (
    <div
      className={`${bg} border text-white text-sm rounded-lg px-4 py-3 shadow-lg flex items-start gap-2 cursor-pointer`}
      onClick={onClose}
    >
      <span className="flex-1">{message}</span>
      <button className="opacity-70 hover:opacity-100 text-xs mt-0.5">✕</button>
    </div>
  );
}
