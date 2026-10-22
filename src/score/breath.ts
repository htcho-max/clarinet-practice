/**
 * 숨 쉬는 곳 추천 (관악기).
 * - 후보: 음과 음 사이마다. 쉼표가 있으면 거의 공짜, 쉼표가 없으면 앞 음 끝을 조금 줄여서 쉬어요.
 *   긴 음 끝·2/4마디 프레이즈 끝·도돌이표 앞·늘임표 뒤는 좋은 자리, 이음줄 중간·박 중간·짧은 음 뒤는 나쁜 자리.
 * - 고르기: 숨 한 번에 부는 시간(템포로 계산)이 내 숨 길이를 넘지 않게 하면서, 비용이 가장 적은 자리들을
 *   동적 계획법으로 골라요 (구간이 길수록 벌점이 커져서 숨이 아슬아슬하게 모자라지 않게).
 * - 악보에 적힌 숨표(breath-mark·caesura)와 내가 넣은 곳은 꼭, 내가 뺀 곳은 빼요.
 * 열쇠는 "그 음 다음에 숨" 의 음 열쇠 `${마디}:${번호}`.
 */
import type { ParsedScore, ScoreNote } from './parse';
import type { Scored } from './align';
import type { InstrumentId } from '../instruments/current';

export interface BreathMark {
  /** 이 음 다음에 숨 */
  after: string;
  measure: number;
  /** big = 큰 숨 (V), short = 짧은 숨 (앞 음을 살짝 줄여 빨리) */
  kind: 'big' | 'short';
  /** auto = 앱 추천, mine = 내가 넣음, score = 악보에 적힌 숨표 */
  src: 'auto' | 'mine' | 'score';
  /** 쉼표에서 쉬는 숨 */
  rest: boolean;
  why: string;
}
export interface BreathPlan {
  marks: BreathMark[];
  /** 숨 한 번에 부는 가장 긴 시간 (초) */
  longestSec: number;
  /** 지금 음 → 곧 숨 쉴 자리 (연주·따라가기 때 미리 알림) */
  alert: Map<string, string>;
  /** 그 음 다음에 쉼표가 있는 음 */
  restAfter: Set<string>;
}
export interface BreathEdits { add: string[]; del: string[] }
export interface PlanOptions { bpm: number; capSec: number; add?: string[]; del?: string[] }

type S = Pick<ParsedScore, 'notes' | 'measures' | 'measureLen' | 'time' | 'bars'>;
const keyOf = (n: ScoreNote) => `${n.measure}:${n.index}`;

/** 음표 길이 이름 (4분음표 = 1) */
export function durName(q: number): string {
  const names: [number, string][] = [[4, '온음표'], [3, '점2분음표'], [2, '2분음표'], [1.5, '점4분음표'], [1, '4분음표'], [0.75, '점8분음표'], [0.5, '8분음표'], [0.25, '16분음표']];
  const f = names.find(([v]) => Math.abs(v - q) < 0.01);
  return f ? f[1] : q > 4 ? '긴 음' : q > 1 ? `${Math.round(q * 10) / 10}박 음` : '짧은 음';
}

interface Cand { i: number; cost: number; kind: 'big' | 'short'; rest: boolean; why: string; forced?: 'score' | 'mine' }

export function planBreaths(s: S, o: PlanOptions): BreathPlan {
  const notes = s.notes;
  const N = notes.length;
  const empty: BreathPlan = { marks: [], longestSec: 0, alert: new Map(), restAfter: new Set() };
  if (!N || !(o.bpm > 0) || !(o.capSec > 0)) return empty;
  const spq = 60 / o.bpm;
  const cap = o.capSec;
  const [beats, unit] = s.time;
  const beatQ = 4 / unit; // 한 박 (4분음표 단위)
  const nominal = beats * beatQ;
  // 마디 시작 위치·순서 (못갖춘마디는 0번째, 첫 온전한 마디부터 1, 2, …)
  const mStart = new Map<number, number>(), mOrd = new Map<number, number>(), mIdx = new Map<number, number>();
  let acc = 0, ord = 0;
  s.measures.forEach((m, k) => {
    if (mStart.has(m)) return;
    mStart.set(m, acc); mIdx.set(m, k);
    const len = s.measureLen.get(m) ?? nominal;
    const short = k === 0 && len < nominal - 0.01;
    if (!short) ord++;
    mOrd.set(m, ord);
    acc += len;
  });
  const at = notes.map((n) => (mStart.get(n.measure) ?? 0) + n.beat);
  // 못갖춘마디로 시작하면 프레이즈도 그만큼 앞에서 끝나요 (끝 = 마디 끝 − 못갖춘마디 길이)
  const m0 = s.measures[0];
  const pickup = m0 !== undefined && (s.measureLen.get(m0) ?? nominal) < nominal - 0.01 ? (s.measureLen.get(m0) ?? 0) : 0;
  const barEnds: [number, number][] = []; // [마디 끝 위치, 그 마디 순서]
  for (const [m, st] of mStart) barEnds.push([st + (s.measureLen.get(m) ?? nominal), mOrd.get(m) ?? 0]);
  /** 다음 음이 pos 에서 시작할 때 몇 번째 마디 프레이즈가 끝나는 자리인지 (아니면 0).
   *  못갖춘마디 곡은 마디 끝 앞의 못갖춘 길이 안 (다음 프레이즈의 여린박 음들 앞) */
  const phraseOrd = (pos: number) => barEnds.find(([e]) => pos >= e - pickup - 0.01 && pos <= e + 0.01)?.[1] ?? 0;
  const end = notes.map((n, i) => at[i] + n.dur);
  const add = new Set(o.add ?? []), del = new Set(o.del ?? []);
  const restAfter = new Set<string>();
  const fifths = notes[0].fifths ?? 0;
  const tonicPc = (((7 * fifths) % 12) + 12) % 12;

  const cands: Cand[] = [];
  for (let i = 0; i < N - 1; i++) {
    const n = notes[i], nx = notes[i + 1], k = keyOf(n);
    const gap = at[i + 1] - end[i];
    if (gap >= 0.24) restAfter.add(k);
    if (del.has(k)) continue;
    const a = n.art ?? {};
    const len = s.measureLen.get(n.measure) ?? nominal;
    const barEnd = (mStart.get(n.measure) ?? 0) + len;
    // 이 음이 마디 끝에서 끝나거나 (쉼표를 지나) 다음 음이 다음 마디에서 시작
    const atBar = Math.abs(end[i] - barEnd) < 0.01 || (nx.measure !== n.measure && at[i + 1] >= barEnd - 0.01);
        const bi = mIdx.get(n.measure) ?? -1;
    const bar = bi >= 0 ? s.bars[bi] : undefined, nbar = bi >= 0 ? s.bars[bi + 1] : undefined;
    const repeatHere = atBar && (!!bar?.backward || !!nbar?.forward || (!!nbar?.ending && JSON.stringify(nbar.ending) !== JSON.stringify(bar?.ending)));
    const why: string[] = [];
    let cost: number, kind: 'big' | 'short', rest = false;
    if (gap >= 0.24) {
      rest = true;
      const gapSec = gap * spq;
      cost = gap >= beatQ - 0.01 ? 0 : 0.4;
      kind = gapSec >= 0.35 ? 'big' : 'short';
      why.push(gap >= beatQ - 0.01 ? '쉼표 — 여기서 편하게 숨 쉬어요' : '짧은 쉼표 — 빨리 들이마셔요');
    } else {
      cost = 4;
      const durSec = n.dur * spq;
      if (durSec >= 1.2) cost -= 1.5; else if (durSec >= 0.6) cost -= 1; else if (durSec >= 0.3) cost -= 0.3; else cost += 1.5;
      if (nx.dur > 0 && n.dur >= 2 * nx.dur && n.dur >= beatQ) { cost -= 0.7; }
      let phrase = '';
      const po = phraseOrd(at[i + 1]);
      // 못갖춘 곡: 여린박 음들 바로 앞이 가장 좋고, 마디 끝으로 갈수록 덜 좋음
      if (po > 0 && pickup > 0) { const e = barEnds.find(([x]) => at[i + 1] >= x - pickup - 0.01 && at[i + 1] <= x + 0.01)![0]; cost += ((at[i + 1] - (e - pickup)) / pickup) * 0.8; }
      if (po > 0 && po % 4 === 0) { cost -= 1.5; phrase = `${po}마디째 — 4마디 프레이즈 끝`; }
      else if (po > 0 && po % 2 === 0) { cost -= 0.8; phrase = '2마디 단위가 끝나는 곳'; }
      else if (po > 0) cost -= 0.3;
      if (pickup > 0 && po > 0) phrase += phrase ? ' (다음 못갖춘 음 앞)' : '';
      else if (atBar) cost -= 0.3;
      if (repeatHere) { cost -= 1.5; phrase = bar?.backward ? '도돌이표 앞 — 돌아가기 전에' : nbar?.forward ? '도돌이 시작 앞' : '괄호가 바뀌는 곳'; }
      if (a.fermata) { cost -= 1.5; why.push('늘임표 뒤'); }
      if (atBar && n.dur >= beatQ && ((n.midi % 12) + 12) % 12 === tonicPc) cost -= 0.5;
      // 박 중간에서 끊으면 어색
      const offBeat = Math.abs(end[i] / beatQ - Math.round(end[i] / beatQ)) > 0.01;
      if (offBeat) cost += 1;
      if (a.slurNext) { cost += 4; }
      cost = Math.max(0.3, cost);
      kind = durSec >= 0.6 && (po > 0 || atBar || a.fermata || repeatHere) && !a.slurNext ? 'big' : 'short';
      if (phrase) why.unshift(phrase);
      why.push(durSec >= 0.45 ? `${durName(n.dur)} 끝을 조금 줄이고 숨` : '앞 음을 짧게 끊고 재빨리 숨');
      if (a.slurNext) why.push('이음줄 중간이라 될 수 있으면 피하는 자리지만 숨이 모자라서');
    }
    const c: Cand = { i, cost, kind, rest, why: why.join(' · ') };
    if (a.breath) { c.forced = 'score'; c.why = '악보에 적힌 숨표'; c.kind = rest ? kind : 'big'; }
    if (add.has(k)) { c.forced = 'mine'; c.why = '내가 넣은 숨 자리' + (rest ? ' (쉼표)' : ''); }
    cands.push(c);
  }

  // 동적 계획법: 위치 = 시작(-1), 후보들, 끝(N-1). 구간 = 두 숨 사이에 부는 음 길이 합(초)
  const pre = [0];
  for (let i = 0; i < N; i++) pre.push(pre[i] + notes[i].dur * spq);
  const blow = (a: number, b: number) => pre[b + 1] - pre[a + 1]; // 음 a+1..b
  const pts: { i: number; c?: Cand }[] = [{ i: -1 }, ...cands.map((c) => ({ i: c.i, c })), { i: N - 1 }];
  const segPen = (sec: number) => (sec > cap ? 60 + (sec - cap) * 20 : 3 * (sec / cap) ** 2);
  const BREATH = 1;
  const best = new Float64Array(pts.length).fill(Infinity);
  const from = new Int32Array(pts.length).fill(-1);
  best[0] = 0;
  for (let q = 1; q < pts.length; q++) {
    const here = pts[q];
    const self = here.c ? (here.c.forced ? -1000 : (here.c.rest ? 0.3 : BREATH) + here.c.cost) : 0; // 쉼표 숨은 거의 공짜
    for (let p = q - 1; p >= 0; p--) {
      const sec = blow(pts[p].i, here.i);
      if (best[p] === Infinity) continue;
      const v = best[p] + segPen(sec) + self;
      if (v < best[q]) { best[q] = v; from[q] = p; }
      // 강제 자리는 건너뛸 수 없음, 너무 멀리는 보지 않음
      if (pts[p].c?.forced) break;
      if (sec > cap * 3) break;
    }
  }
  const chosen: Cand[] = [];
  let longest = 0;
  for (let q = pts.length - 1; q > 0 && from[q] >= 0; q = from[q]) {
    longest = Math.max(longest, blow(pts[from[q]].i, pts[q].i));
    const c = pts[q].c;
    if (c) chosen.push(c);
  }
  chosen.reverse();
  const marks: BreathMark[] = chosen.map((c) => {
    const n = notes[c.i];
    let why = c.why;
    if (!c.forced && !c.rest) {
      // 앞뒤로 숨 쉴 곳이 없어서 고른 곳이면 그렇게 말하기
      why = why || '숨이 모자라기 전에';
    }
    return { after: keyOf(n), measure: n.measure, kind: c.kind, src: c.forced ?? 'auto', rest: c.rest, why };
  });
  // 미리 알림: 숨 직전 음, 그 음이 짧으면(0.8초 미만) 한 음 더 앞에서
  const alert = new Map<string, string>();
  for (const c of chosen) {
    const k = keyOf(notes[c.i]);
    alert.set(k, k);
    if (notes[c.i].dur * spq < 0.8 && c.i > 0) alert.set(keyOf(notes[c.i - 1]), k);
  }
  return { marks, longestSec: Math.round(longest * 10) / 10, alert, restAfter };
}

/** 숨 한 번 길이 (초): 롱톤 기록이 3번 이상이면 잘 분 기록(위에서 20%)의 75%, 아니면 악기 기본값 */
export const DEFAULT_BREATH: Record<InstrumentId, number> = { flute: 6, clarinet: 8 };
export function breathFromLongTones(durs: number[], inst: InstrumentId): { sec: number; auto: boolean; n: number } {
  const d = durs.filter((x) => Number.isFinite(x) && x > 1).sort((a, b) => a - b);
  if (d.length < 3) return { sec: DEFAULT_BREATH[inst], auto: false, n: d.length };
  const p80 = d[Math.min(d.length - 1, Math.floor(d.length * 0.8))];
  return { sec: Math.max(3, Math.min(20, Math.round(p80 * 0.75 * 2) / 2)), auto: true, n: d.length };
}

/** 채점 중 소리가 끊긴 곳 찾기: 소리 → 무음 MIN_GAP 초 이상 → 소리 */
export const MIN_GAP = 0.22;
export class GapDetector {
  private lastSound: number | null = null;
  gaps: [number, number][] = [];
  push(t: number, sounding: boolean) {
    if (!sounding) return;
    if (this.lastSound !== null && t - this.lastSound >= MIN_GAP) this.gaps.push([this.lastSound, t]);
    this.lastSound = t;
  }
}
/** 끊긴 곳 → 그 앞 음 열쇠 (끊긴 뒤에 처음 시작한 음의 바로 앞 음) */
export function gapsToAfterKeys(rs: Scored[], gaps: [number, number][]): string[] {
  const out: string[] = [];
  for (const [, g1] of gaps) {
    const k = rs.findIndex((r) => r.playedStart != null && r.playedStart >= g1 - 0.15);
    if (k > 0) {
      const key = keyOf(rs[k - 1].note);
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

export interface BreathCheck {
  /** 추천 자리에서 숨 쉼 */
  hit: string[];
  /** 추천 자리 (연주한 부분 안, 쉼표 자리 빼고) */
  planned: string[];
  /** 추천에 없는 곳에서 끊김 */
  off: { after: string; measure: number; slur: boolean }[];
  msg: string;
}
/** 실제로 끊긴 곳과 추천 비교. 쉼표·스타카토 뒤의 끊김은 당연하니 빼요 */
export function checkBreaths(plan: BreathPlan, rs: Scored[], taken: string[]): BreathCheck {
  let lastPlayed = -1;
  rs.forEach((r, i) => { if (r.status !== 'missed') lastPlayed = i; });
  const inPlayed = new Set(rs.slice(0, Math.max(0, lastPlayed)).map((r) => keyOf(r.note)));
  const byKey = new Map(rs.map((r) => [keyOf(r.note), r.note]));
  const markSet = new Set(plan.marks.map((m) => m.after));
  const planned = plan.marks.filter((m) => !m.rest && inPlayed.has(m.after)).map((m) => m.after);
  const hit: string[] = [], off: BreathCheck['off'] = [];
  for (const k of taken) {
    const n = byKey.get(k);
    if (!n || !inPlayed.has(k)) continue;
    if (markSet.has(k)) { if (planned.includes(k)) hit.push(k); continue; }
    if (plan.restAfter.has(k) || n.art?.stacc) continue;
    off.push({ after: k, measure: n.measure, slur: !!n.art?.slurNext });
  }
  const parts: string[] = [];
  if (planned.length) parts.push(`추천한 숨 자리 ${planned.length}곳 중 ${hit.length}곳에서 숨을 쉬었어요`);
  if (off.length) {
    const ms = off.map((x) => `${x.measure}마디${x.slur ? '(이음줄 중간)' : ''}`);
    parts.push(`추천에 없는 곳에서 끊긴 곳: ${[...new Set(ms)].join('·')} — 숨이 모자랐다면 앞쪽 추천 자리에서 더 깊이 들이마셔 보세요`);
  } else if (taken.length) parts.push('프레이즈 중간에서 끊긴 곳은 없었어요');
  return { hit, planned, off, msg: parts.join('. ') + (parts.length ? '.' : '') };
}
