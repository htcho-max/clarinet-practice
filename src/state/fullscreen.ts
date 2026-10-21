import { useEffect, useState } from 'react';

/** 전체 화면 (상태 표시줄·주소창·내비게이션 바 숨김). 브라우저는 누르는 순간에만 들어갈 수 있어요 */
const KEY = 'clarinet-fullscreen';
type Doc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type El = HTMLElement & { webkitRequestFullscreen?: (o?: unknown) => Promise<void> };

export const fullscreenSupported = () => {
  const d = document as Doc & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
};
export const isFullscreen = () => {
  const d = document as Doc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement) || window.matchMedia?.('(display-mode: fullscreen)').matches === true;
};
/** 설치한 앱이 이미 전체 화면으로 열렸는지 (그러면 버튼이 필요 없음) */
export const appFullscreen = () => window.matchMedia?.('(display-mode: fullscreen)').matches === true && !(document as Doc).fullscreenElement && !(document as Doc).webkitFullscreenElement;

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as El;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch { return false; }
}
export async function exitFullscreen() {
  const d = document as Doc;
  try { if (d.fullscreenElement) await d.exitFullscreen(); else if (d.webkitFullscreenElement) await d.webkitExitFullscreen?.(); } catch { /* 무시 */ }
}

export const fullscreenPref = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setFullscreenPref = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 무시 */ } };

export function useFullscreen() {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const f = () => setOn(isFullscreen());
    document.addEventListener('fullscreenchange', f);
    document.addEventListener('webkitfullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); document.removeEventListener('webkitfullscreenchange', f); };
  }, []);
  return { on, supported: fullscreenSupported() && !appFullscreen(), toggle: () => (isFullscreen() ? exitFullscreen() : enterFullscreen()) };
}

/**
 * "열 때 전체 화면"이 켜져 있으면: 앱을 열거나 다른 앱에서 돌아온 뒤 첫 터치에 전체 화면으로.
 * 사용자가 뒤로 버튼 등으로 직접 나가면 다음에 돌아올 때까지는 다시 들어가지 않아요.
 */
export function useAutoFullscreen() {
  useEffect(() => {
    if (!fullscreenSupported() || appFullscreen()) return;
    let armed = fullscreenPref();
    const tap = () => { if (armed && !isFullscreen()) { armed = false; void enterFullscreen(); } };
    const vis = () => { if (document.visibilityState === 'visible') armed = fullscreenPref(); };
    window.addEventListener('pointerup', tap);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pointerup', tap); document.removeEventListener('visibilitychange', vis); };
  }, []);
}
