import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { Notifications } from './components/Notification';
import { useSocketEvents } from './hooks/useSocketEvents';

type AppPage = 'home' | 'game';

export default function App() {
  const [page, setPage] = useState<AppPage>('home');

  useSocketEvents();

  return (
    <>
      <Notifications />
      {page === 'home' ? (
        <HomePage onEnterGame={() => setPage('game')} />
      ) : (
        <GamePage />
      )}
    </>
  );
}
