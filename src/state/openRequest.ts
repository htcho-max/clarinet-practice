/** 다른 화면(오늘)에서 악보를 특정 마디·집중 연습으로 바로 열기 */
export interface ScoreOpenRequest { scoreId: number; measure?: number; /** 끝 마디 (없으면 지금 구간 길이로) */ to?: number; drill?: boolean; /** 이 연습 기록의 분석을 보여주며 열기 */ runId?: number }
let pending: ScoreOpenRequest | null = null;
export const requestScore = (r: ScoreOpenRequest) => { pending = r; };
export const takeScoreRequest = () => { const p = pending; pending = null; return p; };

/** 악보에서 음표를 길게 눌러 운지표에서 그 음 보기 (악보음 midi) */
export interface FingeringRequest {
  midi: number;
  /** 운지표에서 처음 보여줄 운지 (0 = 기본, 1~ = 다른 운지) */
  alt?: number;
  /** 운지표에서 "◀ 악보로" 돌아갈 곳 */
  back?: { scoreId: number; title: string; measure: number; from: number; to: number };
}
let pendingFg: FingeringRequest | null = null;
const fgListeners = new Set<(r: FingeringRequest) => void>();
export const requestFingering = (r: FingeringRequest) => { pendingFg = r; fgListeners.forEach((f) => f(r)); };
export const takeFingeringRequest = () => { const p = pendingFg; pendingFg = null; return p; };
/** 요청이 오면 (App: 운지표 탭으로) */
export function onFingeringRequest(fn: (r: FingeringRequest) => void) { fgListeners.add(fn); return () => { fgListeners.delete(fn); }; }
