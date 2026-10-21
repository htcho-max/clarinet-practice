/**
 * 앱이 갑자기 꺼졌는지 알아보기.
 * 재생·마이크를 쓰는 동안 표시를 남기고, 정상으로 멈추거나 화면을 떠나면(pagehide·숨김) 지움.
 * 다음에 열었을 때 표시가 남아 있으면 그 사이에 꺼진 것 (브라우저가 메모리 부족으로 닫힌 경우 등).
 */
const KEY = 'clarinet-busy';
const LOG = 'clarinet-crash-log';
export type BusyKind = 'play' | 'mic';
const active = new Set<BusyKind>();
let hidden = false;
let wrote = false;

function write() {
  try {
    if (active.size && !hidden) { localStorage.setItem(KEY, JSON.stringify({ kinds: [...active], at: Date.now() })); wrote = true; }
    else if (wrote) { localStorage.removeItem(KEY); wrote = false; } // 이번 실행이 남긴 표시만 지움
  } catch { /* 무시 */ }
}
export function markBusy(k: BusyKind) { active.add(k); write(); }
export function clearBusy(k: BusyKind) { active.delete(k); write(); }

export interface CrashInfo { kinds: BusyKind[]; at: number }
export interface CrashLog { count: number; last: CrashInfo | null }

/** 앱을 열 때 한 번: 지난번에 쓰는 중에 꺼졌으면 그 정보 (그리고 기록에 더함). 모듈을 읽는 순간 확인해 둠 */
let initial: CrashInfo | null | undefined;
export function takeCrash(): CrashInfo | null {
  if (initial === undefined) initial = readCrash();
  const c = initial; initial = null;
  return c;
}
function readCrash(): CrashInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CrashInfo;
    if (!c?.at || Date.now() - c.at > 6 * 3600 * 1000) return null; // 오래된 표시는 무시
    const log = crashLog();
    localStorage.setItem(LOG, JSON.stringify({ count: log.count + 1, last: c }));
    return c;
  } catch { return null; }
}
export function crashLog(): CrashLog {
  try { return { count: 0, last: null, ...JSON.parse(localStorage.getItem(LOG) || '{}') }; } catch { return { count: 0, last: null }; }
}
export const crashText = (c: CrashInfo) => (c.kinds.includes('play') && c.kinds.includes('mic') ? '반주·박자를 틀고 연주하는' : c.kinds.includes('play') ? '악보를 재생하는' : '마이크로 듣는');

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initial = readCrash();
  // 다른 앱으로 가거나 닫으면 정상 종료로 봄. 돌아오면 다시 표시
  document.addEventListener('visibilitychange', () => { hidden = document.visibilityState === 'hidden'; write(); });
  window.addEventListener('pagehide', () => { hidden = true; write(); });
  window.addEventListener('pageshow', () => { hidden = document.visibilityState === 'hidden'; write(); });
}
