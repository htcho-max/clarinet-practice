/**
 * 브레이크(레지스터) 넘기 분석.
 * 아래 음 ↔ 위 음을 오갈 때, 앞 음이 끝난 뒤 다음 음이 자리 잡기까지 걸린 시간(끊김)과
 * 그 사이에 엉뚱하게 높은 소리(끽 소리, 삑사리)가 났는지를 봐요.
 */
export interface BreakFrame { t: number; /** 악보음 midi (소수), 소리 없으면 null */ m: number | null }
export interface Crossing { dir: 'up' | 'down'; at: number; gapMs: number; squeak: boolean; stray: boolean }
export interface BreakResult {
  crossings: Crossing[];
  up: { n: number; meanGapMs: number | null; clean: number };
  down: { n: number; meanGapMs: number | null; clean: number };
  squeaks: number;
  clean: number;
  meanGapMs: number | null;
  /** 0~100 */
  score: number;
}

const HOLD = 0.12; // 이만큼 이어져야 "자리 잡은" 음
const MERGE = 0.05; // 이보다 짧은 끊김은 같은 음으로
const MAX_GAP = 1.0; // 이보다 길게 쉬면 넘기로 치지 않음
export const CLEAN_GAP_MS = 80;

type Label = 'lo' | 'hi' | 'other' | 'silent';
interface Run { label: Label; start: number; end: number; maxM: number }

export function labelOf(m: number | null, lo: number, hi: number): Label {
  if (m === null) return 'silent';
  if (Math.abs(m - lo) < 0.5) return 'lo';
  if (Math.abs(m - hi) < 0.5) return 'hi';
  return 'other';
}

function runsOf(frames: BreakFrame[], lo: number, hi: number): Run[] {
  const runs: Run[] = [];
  for (const f of frames) {
    const label = labelOf(f.m, lo, hi);
    const last = runs[runs.length - 1];
    if (last && last.label === label) { last.end = f.t; if (f.m !== null) last.maxM = Math.max(last.maxM, f.m); continue; }
    runs.push({ label, start: f.t, end: f.t, maxM: f.m ?? -Infinity });
  }
  // 같은 음 사이의 아주 짧은 끊김·튐은 메우기
  const merged: Run[] = [];
  for (const r of runs) {
    const a = merged[merged.length - 1], b = merged[merged.length - 2];
    if (a && b && (a.label === 'silent' || a.label === 'other') && a.end - a.start < MERGE && b.label === r.label && r.label !== 'other' && r.label !== 'silent') {
      merged.pop(); b.end = r.end; b.maxM = Math.max(b.maxM, a.maxM, r.maxM); continue;
    }
    merged.push({ ...r });
  }
  return merged;
}

export function analyzeBreak(frames: BreakFrame[], lo: number, hi: number): BreakResult {
  const runs = runsOf(frames, lo, hi);
  const stable = runs.map((r, i) => ({ r, i })).filter(({ r }) => (r.label === 'lo' || r.label === 'hi') && r.end - r.start >= HOLD);
  const crossings: Crossing[] = [];
  for (let k = 1; k < stable.length; k++) {
    const A = stable[k - 1], B = stable[k];
    if (A.r.label === B.r.label) continue;
    // 앞 음이 자리 잡은 뒤 끝난 시각 → 다음 음이 처음 들린 시각 (짧게 들렸다 끊긴 것도 다음 음으로)
    let arrive = B.r.start;
    for (let j = B.i - 1; j > A.i; j--) if (runs[j].label === B.r.label) arrive = runs[j].start;
    const gap = arrive - A.r.end;
    if (gap > MAX_GAP) continue;
    const between = runs.slice(A.i + 1, B.i);
    const squeak = between.some((r) => r.label === 'other' && r.maxM > Math.max(lo, hi) + 2.5);
    const stray = between.some((r) => r.label === 'other' && r.end - r.start >= 0.06);
    crossings.push({ dir: B.r.label === 'hi' ? 'up' : 'down', at: arrive, gapMs: Math.max(0, Math.round(gap * 1000)), squeak, stray });
  }
  const isClean = (c: Crossing) => !c.squeak && !c.stray && c.gapMs <= CLEAN_GAP_MS;
  const side = (dir: 'up' | 'down') => {
    const cs = crossings.filter((c) => c.dir === dir);
    return { n: cs.length, meanGapMs: cs.length ? Math.round(cs.reduce((a, c) => a + c.gapMs, 0) / cs.length) : null, clean: cs.filter(isClean).length };
  };
  const pts = (c: Crossing) => (c.squeak ? 0 : c.stray ? 30 : c.gapMs <= 60 ? 100 : c.gapMs <= CLEAN_GAP_MS ? 90 : c.gapMs <= 150 ? 65 : c.gapMs <= 300 ? 40 : 20);
  return {
    crossings,
    up: side('up'),
    down: side('down'),
    squeaks: crossings.filter((c) => c.squeak).length,
    clean: crossings.filter(isClean).length,
    meanGapMs: crossings.length ? Math.round(crossings.reduce((a, c) => a + c.gapMs, 0) / crossings.length) : null,
    score: crossings.length ? Math.round(crossings.reduce((a, c) => a + pts(c), 0) / crossings.length) : 0,
  };
}

export function breakAdvice(r: BreakResult, inst: 'clarinet' | 'flute'): string[] {
  const out: string[] = [];
  if (!r.crossings.length) return ['두 음을 번갈아 0.2초 이상씩 불어 주세요. 한 음을 길게, 넘어가서 또 길게.'];
  if (r.squeaks) out.push(inst === 'clarinet'
    ? `끽 소리가 ${r.squeaks}번 났어요. 넘어갈 때 아랫입술로 리드를 누르지 말고, 턱을 움직이지 마세요. 오른손 링이 반쯤 열리지 않았는지도 확인하세요.`
    : `엉뚱한 높은 소리가 ${r.squeaks}번 났어요. 바람 속도를 갑자기 올리지 말고 입술 모양을 그대로 두세요.`);
  if ((r.up.meanGapMs ?? 0) > 120) out.push(inst === 'clarinet' ? '올라갈 때 끊겨요. 손가락을 한꺼번에(특히 오른손은 미리 내려 두고) 움직이고, 숨은 계속 흘려 보내세요.' : '올라갈 때 끊겨요. 손가락을 동시에 바꾸고 숨은 끊지 마세요.');
  if ((r.down.meanGapMs ?? 0) > 120) out.push('내려올 때 끊겨요. 내려올 때도 숨을 줄이지 말고 손가락만 바꾸세요.');
  if (!out.length) out.push(r.score >= 85 ? '깨끗해요! 조금 더 빠르게 오가거나 다른 짝으로 넘어가 보세요.' : '좋아요. 끊김을 더 줄이려면 천천히, 손가락을 정확히 동시에.');
  return out;
}
