import { type Key, type MinorForm, type Pitch, scalePitch, midiOf, dOf } from './theory';

/** 패턴이 만드는 음. 프레이즈 끝 음은 박에 맞게 늘어나고, 마지막 프레이즈의 끝 음이 마침음 */
export interface PNote { p: Pitch }
export type Phrase = PNote[];

/** 쓸 수 있는 음역 (악보음 midi) */
export interface RangeOptions { lo: number; hi: number }
export const inRange = (p: Pitch, r: RangeOptions) => { const m = midiOf(p); return m >= r.lo && m <= r.hi; };

const sp = (key: Key, d: number, dir: 1 | -1, form?: MinorForm): PNote => ({ p: scalePitch(key, d, dir, form) });
export const range = (a: number, b: number) => { const o: number[] = []; for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) o.push(i); return o; };
const isTonic = (key: Key, d: number) => (((d - key.startD) % 7) + 7) % 7 === 0;
const isTriad = (key: Key, d: number) => [0, 2, 4].includes((((d - key.startD) % 7) + 7) % 7);

export function scale(key: Key, lo: number, hi: number): Phrase[] {
  return [range(lo, hi).map((d) => sp(key, d, 1)), range(hi - 1, lo).map((d) => sp(key, d, -1))];
}
export function arpeggio(key: Key, lo: number, hi: number): Phrase[] {
  const up = range(lo, hi).filter((d) => isTriad(key, d));
  return [up.map((d) => sp(key, d, 1, 'harmonic')), up.slice(0, -1).reverse().map((d) => sp(key, d, -1, 'harmonic'))];
}
/** 3도: 1-3, 2-4, … */
export function thirds(key: Key, lo: number, hi: number): Phrase[] {
  const up: PNote[] = [], down: PNote[] = [];
  for (let d = lo; d + 2 <= hi; d++) up.push(sp(key, d, 1), sp(key, d + 2, 1));
  up.push(sp(key, hi, 1));
  for (let d = hi - 1; d - 2 >= lo; d--) down.push(sp(key, d, -1), sp(key, d - 2, -1));
  down.push(sp(key, lo, -1));
  return [up, down];
}
/** 4음 시퀀스: 1234 2345 … */
export function seq4(key: Key, lo: number, hi: number): Phrase[] {
  const up: PNote[] = [], down: PNote[] = [];
  for (let d = lo; d + 3 <= hi; d++) up.push(...range(d, d + 3).map((x) => sp(key, x, 1)));
  up.push(sp(key, hi, 1));
  for (let d = hi - 1; d - 3 >= lo; d--) down.push(...range(d, d - 3).map((x) => sp(key, x, -1)));
  down.push(sp(key, lo, -1));
  return [up, down];
}
/** 반음계 (midi 로) */
export function chromatic(lo: number, hi: number): Phrase[] {
  const P = (m: number): PNote => {
    const pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1;
    const map: [string, number][] = [['C', 0], ['C', 1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['B', -1], ['B', 0]];
    const [L, alter] = map[pc];
    return { p: { d: dOf(L, oct), alter } };
  };
  return [range(lo, hi).map(P), range(hi - 1, lo).map(P)];
}

/** 조·음역에서 가능한 음역 (으뜸음 → 으뜸음, 안 되면 낼 수 있는 가장 높은 음까지) */
export function autoRange(key: Key, r: RangeOptions, octaves: number): [number, number] | null {
  const ok = (d: number) => inRange(scalePitch(key, d, 1), r) && inRange(scalePitch(key, d, -1), r);
  let lo = -1;
  for (let d = 20; d < 46; d++) if (isTonic(key, d) && ok(d)) { lo = d; break; }
  if (lo < 0) return null;
  if (range(lo, lo + 7 * octaves).every(ok)) return [lo, lo + 7 * octaves];
  // 원하는 옥타브가 안 되면 낼 수 있는 가장 높은 음까지
  let hi = lo; while (ok(hi + 1)) hi++;
  return hi - lo >= 4 ? [lo, hi] : null;
}

/* ---------- 클라리넷 전용 ---------- */

const N = (L: string, oct: number, alter = 0): PNote => ({ p: { d: dOf(L, oct), alter } });

/** 12도 올리기: 샬뤼모 음 → 레지스터 키만 더해 클라리온 음 (슬러로) */
export function twelfths(): Phrase[] {
  const pairs: [PNote, PNote][] = [
    [N('C', 4), N('G', 5)],
    [N('B', 3, -1), N('F', 5)],
    [N('A', 3), N('E', 5)],
    [N('G', 3), N('D', 5)],
    [N('F', 3), N('C', 5)],
    [N('E', 3), N('B', 4)],
  ];
  return [...pairs.map(([a, b]) => [a, b, b, a]), [N('C', 4)]];
}

/** 브레이크 넘기: 스로트 음 ↔ 클라리온 아래쪽 음 */
export function breakDrill(): Phrase[] {
  const pairs: [PNote, PNote][] = [
    [N('A', 4), N('B', 4)],
    [N('G', 4), N('C', 5)],
    [N('A', 4), N('C', 5)],
    [N('B', 4, -1), N('C', 5)],
    [N('G', 4), N('B', 4)],
    [N('A', 4), N('D', 5)],
    [N('F', 4), N('C', 5)],
    [N('G', 4), N('D', 5)],
  ];
  return [...pairs.map(([a, b]) => [a, b, a, b]), [N('C', 5)]];
}

/* ---------- 에튀드 ---------- */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TEMPLATES: Record<number, { arp: number[]; broken: number[]; scale: number[] }> = {
  2: { arp: [0, 1, 2, 3, 4, 3, 2, 1], broken: [0, 2, 1, 2, 0, 2, 1, 2], scale: [0, 1, 2, 3, 4, 3, 2, 1] },
  3: { arp: [0, 1, 2, 3, 2, 1, 1, 2, 3, 4, 3, 2], broken: [0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 2, 1], scale: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, -1] },
  4: { arp: [0, 1, 2, 1, 1, 2, 3, 2, 2, 3, 4, 3, 4, 3, 2, 1], broken: [0, 2, 1, 2, 0, 2, 1, 2, 1, 3, 2, 3, 1, 3, 2, 3], scale: [0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 1] },
};
export interface EtudeOptions { lo: number; hi: number; perBeat: number; seed: number; r: RangeOptions; highMiddle?: boolean }

/**
 * 8마디 에튀드: 화성 진행(I IV V I vi ii V I / 단조 i iv V i VI iv V i) 위에 분산화음·음계 음형.
 * 첫 4마디와 다음 3마디는 음형을 바꾸고, highMiddle 이면 5~6마디를 높은 음역(브레이크 위)으로.
 */
export function etude(key: Key, o: EtudeOptions): Phrase[] {
  const r = Math.max(2, Math.min(4, o.perBeat));
  const T = TEMPLATES[r];
  const rand = rng(o.seed);
  const minor = key.mode === 'minor';
  const prog = minor ? [0, 3, 4, 0, 5, 3, 4] : [0, 3, 4, 0, 5, 1, 4];
  const kinds = (['arp', 'broken'] as const);
  const first = kinds[Math.floor(rand() * 2)];
  const second = rand() < 0.5 ? 'scale' : first === 'arp' ? 'broken' : 'arp';
  const playable = (p: Pitch) => inRange(p, o.r);
  const form = (deg: number): MinorForm => (minor ? (deg === 4 ? 'harmonic' : 'natural') : 'natural');
  const notes: PNote[] = [];
  let last = o.lo + 2 + Math.floor(rand() * 3);
  prog.forEach((deg, bar) => {
    const kind = bar < 4 ? first : bar < 6 ? second : first;
    const tpl = T[kind];
    const f = form(deg);
    const tones = (d: number) => [0, 2, 4].includes((((d - key.startD - deg) % 7) + 7) % 7);
    const ok = (d: number, dir: 1 | -1) => d >= o.lo && d <= o.hi && playable(scalePitch(key, d, dir, f));
    // 음계 음형이면 온음계 사다리, 아니면 화음 구성음 사다리
    const ladder = range(o.lo, o.hi).filter((d) => (kind === 'scale' || tones(d)) && ok(d, 1) && ok(d, -1));
    const span = Math.max(...tpl) - Math.min(...tpl);
    const minT = Math.min(...tpl);
    const home = o.lo + 3;
    const target = o.highMiddle && (bar === 4 || bar === 5) ? o.hi - 2 : Math.round((last + home) / 2);
    let best = -1, bestCost = Infinity;
    ladder.forEach((d, i) => {
      if (kind === 'scale' && !tones(d)) return; // 음계도 화음 음에서 시작
      if (i + minT < 0 || i + minT + span >= ladder.length) return;
      const root = (((d - key.startD - deg) % 7) + 7) % 7 === 0;
      const cost = Math.abs(d - target) + (bar === 0 && !root ? 10 : 0) + (o.highMiddle && (bar === 4 || bar === 5) ? 0 : rand() * 0.8);
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    if (best < 0) best = Math.max(0, -minT);
    tpl.forEach((t, j) => {
      const d = ladder[Math.max(0, Math.min(ladder.length - 1, best + t))];
      const dir: 1 | -1 = j > 0 && t < tpl[j - 1] ? -1 : 1;
      notes.push({ p: scalePitch(key, d, minor && deg !== 4 ? 1 : dir, minor && deg !== 4 ? 'natural' : f) });
    });
    last = notes[notes.length - 1].p.d;
  });
  // 마침: 마지막 음에서 가장 가까운 으뜸음
  let fin = -1;
  for (let d = o.lo; d <= o.hi; d++) if (isTonic(key, d) && playable(scalePitch(key, d, 1)) && (fin < 0 || Math.abs(d - last) < Math.abs(fin - last))) fin = d;
  return [notes, [sp(key, fin, 1)]];
}

export { midiOf };
