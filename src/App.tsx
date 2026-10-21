import { takeCrash, crashText, type CrashInfo } from './state/crashGuard';
import { resolveLite } from './state/lite';
import { ItemAlert } from './components/ItemAlert';
import { useEffect, useState } from 'react';
import { TabBar, type TabId } from './components/TabBar';
import { StatusBar } from './components/StatusBar';
import { SettingsSheet } from './components/SettingsSheet';
import { Today } from './pages/Today';
import { Tuner } from './pages/Tuner';
import { Metronome } from './pages/Metronome';
import { Tone } from './pages/Tone';
import { Fingering } from './pages/Fingering';
import { TABS } from './components/TabBar';
import { Log } from './pages/Log';
import { Score } from './pages/Score';
import { useSettings } from './state/settings';
import { useFullscreen, useAutoFullscreen } from './state/fullscreen';
import { useBackLayer, setExitWarning, restoreGuard } from './state/back';

const TITLES: Record<TabId, string> = { today: '오늘의 연습', tuner: '튜너', fingering: '운지표', tone: '기초 연습', metronome: '메트로놈', score: '악보', log: '연습 기록' };

export function App({ updatedFrom = null }: { updatedFrom?: string | null }) {
  const [toast, setToast] = useState<string | null>(updatedFrom ? `새 버전으로 업데이트됐어요 · ${__APP_VERSION__}` : null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);
  const [tab, setTab] = useState<TabId>(() => {
    try { const t = localStorage.getItem('clarinet-tab') as TabId; return TABS.some((x) => x.id === t) ? t : 'today'; } catch { return 'today'; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { ready, settings, update } = useSettings();
  // 지난번에 재생·마이크 쓰는 중에 꺼졌으면 알려 주기
  const [crash, setCrash] = useState<CrashInfo | null>(() => takeCrash());
  const fs = useFullscreen();
  useAutoFullscreen();
  const go = (t: TabId) => { setTab(t); try { localStorage.setItem('clarinet-tab', t); } catch { /* 무시 */ } };
  // 뒤로 가기: 설정 창 → 닫기, 다른 탭 → 오늘, 오늘에서는 한 번 안내
  useBackLayer(tab !== 'today', () => go('today'));
  useBackLayer(settingsOpen, () => setSettingsOpen(false));
  useEffect(() => {
    setExitWarning(() => setToast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요'));
    const again = () => restoreGuard();
    window.addEventListener('pointerdown', again);
    return () => { setExitWarning(null); window.removeEventListener('pointerdown', again); };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLES[tab]}</h1>
        {fs.supported && (
          <button className="icon-btn fs-btn" onClick={() => void fs.toggle()} aria-label={fs.on ? '전체 화면 나가기' : '전체 화면'} title={fs.on ? '전체 화면 나가기' : '전체 화면'} data-testid="fullscreen-toggle">
            {fs.on ? <FsExit /> : <FsEnter />}
          </button>
        )}
      </header>
      <StatusBar tab={tab} go={go} />
      {crash && ready && (
        <div className="card crash-note" role="alert" data-testid="crash-note">
          <b>지난번에 {crashText(crash)} 중에 앱이 갑자기 꺼졌어요.</b>
          {resolveLite(settings.perfMode)
            ? <p className="hint">가벼운 모드가 켜져 있어요. 다른 앱을 닫고, 긴 곡은 4~8마디씩 나눠 연습하면 덜 꺼져요.</p>
            : <p className="hint">기기 메모리가 부족했을 수 있어요. 가벼운 모드를 켜면 소리 예약·음 분석·화면 효과를 줄여서 덜 꺼져요.</p>}
          <div className="session-controls">
            {!resolveLite(settings.perfMode) && <button className="primary" onClick={() => { update({ perfMode: 'lite' }); setCrash(null); }} data-testid="crash-lite">가벼운 모드 켜기</button>}
            <button onClick={() => setCrash(null)}>닫기</button>
          </div>
        </div>
      )}
      <main>
        {!ready ? null : (
          <>
            {tab === 'today' && <Today go={go} openSettings={() => setSettingsOpen(true)} />}
            {tab === 'tuner' && <Tuner />}
            {tab === 'metronome' && <Metronome />}
            {tab === 'fingering' && <Fingering />}
            {tab === 'tone' && <Tone />}
            {tab === 'score' && <Score />}
            {tab === 'log' && <Log goTab={go} />}
          </>
        )}
      </main>
      <ItemAlert />
      <TabBar tab={tab} onChange={go} />
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast" role="status" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}

/** 전체 화면 아이콘 (네 모서리) */
function FsEnter() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
}
function FsExit() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>;
}
