import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setupUpdates } from './state/appUpdate';
import { P } from './instruments/profiles';
import { requestPersist } from './data/backup';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsProvider } from './state/settings';
import { SessionProvider } from './state/session';
import './styles.css';

const { updatedFrom } = setupUpdates();
document.title = P.title;
document.documentElement.dataset.inst = P.id;
// 기록이 지워지지 않도록 저장 공간 유지 요청 (설치된 앱이면 대개 허락됨)
requestPersist();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <SessionProvider>
        <ErrorBoundary><App updatedFrom={updatedFrom} /></ErrorBoundary>
      </SessionProvider>
    </SettingsProvider>
  </StrictMode>,
);
