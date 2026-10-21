import { LITE } from '../state/lite';
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // 가벼운 모드: 버퍼를 넉넉히 (소리 끊김·과부하 줄이기)
    ctx = new AC({ latencyHint: LITE ? 'playback' : 'interactive' });
  }
  return ctx;
}

/** iOS 등에서는 사용자 터치 안에서 호출해야 소리가 납니다. */
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') {
    try { await c.resume(); } catch { /* 무시 */ }
  }
  return c;
}

// 화면 복귀 시 다시 깨우기
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  });
}
