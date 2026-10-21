/**
 * 가벼운 모드 (메모리·성능이 낮은 기기, 예: 갤럭시 탭 A7 3GB).
 * React 밖(플레이어·마이크 분석)에서도 바로 읽도록 모듈 변수로 둠.
 */
export type PerfMode = 'auto' | 'lite' | 'full';

/** 기기 메모리(GB, 크롬이 2·4·8 로 어림해서 알려줌). 모르면 null */
export const deviceMemory = (): number | null => {
  const m = (globalThis.navigator as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory;
  return typeof m === 'number' ? m : null;
};
/** 자동이면 메모리 4GB 이하를 가벼운 모드로 */
export const autoLite = () => { const m = deviceMemory(); return m !== null && m <= 4; };
export const resolveLite = (mode: PerfMode | undefined) => (mode === 'lite' ? true : mode === 'full' ? false : autoLite());

export let LITE = false;
export function setLite(on: boolean) {
  LITE = on;
  try { document.documentElement.classList.toggle('lite', on); } catch { /* 무시 */ }
}
