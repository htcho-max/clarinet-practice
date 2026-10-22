/**
 * 악보 운지 추천 (악보음 기준). 쓸모 있는 곳에만 짧은 표시를 달아요.
 * - 클라리넷: 새끼손가락 키가 이어질 때 왼손·오른손을 번갈아 (같은 새끼로 미끄러지지 않게, 작은 동적 계획법)
 * - 클라리넷: 짧은 B♭4 가 A4 와 붙어 있으면 옆 키 운지, 스로트 음에서 바로 브레이크 위로 넘어가면 "오른손 미리 내리기"
 * - 플룻: 내림표 조에서 B♮ 가 가까이 없으면 엄지 B♭, E–F♯–G 사이의 짧은 F♯ 은 오른손 중지
 * 운지 종류는 운지표 데이터(main + alts)에서 찾아요 (alt = [main, ...alts] 의 번호).
 */
import type { ParsedScore, ScoreNote } from './parse';
import type { AnyNoteFingering } from '../instruments/profiles';
import type { InstrumentId } from '../instruments/current';
import { prettyName } from '../audio/notes';

export interface FingerAdvice { alt: number; label: string; why: string }

const PINKY = ['lEB', 'rEB', 'lFC', 'rFC', 'lFs', 'rFs', 'rAb'];
/** 이 운지의 새끼손가락 키 (없으면 null): hand L/R, key 그룹 */
export function pinkyOf(keys: readonly string[]): { hand: 'L' | 'R'; key: string } | null {
  const k = keys.find((x) => PINKY.includes(x));
  return k ? { hand: k[0] === 'l' ? 'L' : 'R', key: k.slice(1) } : null;
}
const optionsOf = (fg: AnyNoteFingering | undefined) => (fg ? [fg.main, ...fg.alts] : []);
const nm = (m: number) => prettyName(m);

/** 음마다 시작 위치(4분음표 단위, 악보 처음부터) */
function absStarts(s: Pick<ParsedScore, 'notes' | 'measures' | 'measureLen' | 'time'>): number[] {
  const [beats, unit] = s.time;
  const start = new Map<number, number>();
  let acc = 0;
  for (const m of s.measures) { if (!start.has(m)) start.set(m, acc); acc += s.measureLen.get(m) ?? (beats * 4) / unit; }
  return s.notes.map((n) => (start.get(n.measure) ?? 0) + n.beat);
}

export function adviseFingering(s: Pick<ParsedScore, 'notes' | 'measures' | 'measureLen' | 'time'>, inst: InstrumentId, fingerings: AnyNoteFingering[]): Map<string, FingerAdvice> {
  const out = new Map<string, FingerAdvice>();
  const notes = s.notes;
  if (!notes.length) return out;
  const fgOf = new Map(fingerings.map((f) => [f.midi, f]));
  const at = absStarts(s);
  const key = (n: ScoreNote) => `${n.measure}:${n.index}`;
  /** i 와 i+1 이 쉼 없이 이어지는지 */
  const joined = (i: number) => i + 1 < notes.length && Math.abs(at[i] + notes[i].dur - at[i + 1]) < 0.05;
  const prevJ = (i: number) => (i > 0 && joined(i - 1) ? notes[i - 1] : null);
  const nextJ = (i: number) => (joined(i) ? notes[i + 1] : null);

  if (inst === 'clarinet') {
    // ── 1. 새끼손가락 번갈아 ──
    const pinkyOpts = notes.map((n) => {
      const opts = optionsOf(fgOf.get(n.midi));
      if (!opts.length || !pinkyOf(opts[0].keys)) return null; // 기본 운지가 새끼를 쓰는 음만
      return opts.map((o, alt) => ({ alt, p: pinkyOf(o.keys) })).filter((o) => o.p) as { alt: number; p: { hand: 'L' | 'R'; key: string } }[];
    });
    let i = 0;
    while (i < notes.length) {
      if (!pinkyOpts[i]) { i++; continue; }
      let j = i;
      while (j + 1 < notes.length && pinkyOpts[j + 1] && joined(j)) j++;
      const seg = Array.from({ length: j - i + 1 }, (_, k) => i + k);
      const keysUsed = new Set(seg.map((x) => notes[x].midi));
      if (seg.length >= 2 && keysUsed.size >= 2) {
        // 비터비: 비용 = 다른 운지 1, 같은 손 새끼로 다른 키 10
        const opts = seg.map((x) => pinkyOpts[x]!);
        const cost: number[][] = opts.map((o) => o.map(() => Infinity));
        const back: number[][] = opts.map((o) => o.map(() => -1));
        opts[0].forEach((o, a) => { cost[0][a] = o.alt > 0 ? 1 : 0; });
        for (let k = 1; k < opts.length; k++) {
          opts[k].forEach((o, b) => {
            opts[k - 1].forEach((p, a) => {
              const slide = p.p.hand === o.p.hand && p.p.key !== o.p.key ? 10 : 0;
              const c = cost[k - 1][a] + slide + (o.alt > 0 ? 1 : 0);
              if (c < cost[k][b]) { cost[k][b] = c; back[k][b] = a; }
            });
          });
        }
        const last = opts.length - 1;
        let b = cost[last].indexOf(Math.min(...cost[last]));
        const pick: number[] = [];
        for (let k = last; k >= 0; k--) { pick[k] = b; b = back[k][b]; }
        seg.forEach((x, k) => {
          const o = opts[k][pick[k]];
          const hand = o.p.hand === 'L' ? '왼손' : '오른손';
          const nb = k > 0 ? notes[seg[k - 1]].midi : notes[seg[k + 1]].midi;
          const pair = k > 0 ? `${nm(nb)}→${nm(notes[x].midi)}` : `${nm(notes[x].midi)}→${nm(nb)}`;
          out.set(key(notes[x]), {
            alt: o.alt, label: o.p.hand,
            why: `${pair}: 같은 새끼손가락으로 미끄러지지 않게 ${nm(notes[x].midi)}는 ${hand} 새끼로`,
          });
        });
      }
      i = j + 1;
    }
    // ── 2. 스로트 음 ──
    notes.forEach((n, x) => {
      if (n.midi < 67 || n.midi > 70 || out.has(key(n))) return;
      const p = prevJ(x), q = nextJ(x);
      if (n.midi === 70 && n.dur <= 0.5 + 1e-9 && (p?.midi === 69 || q?.midi === 69)) {
        const opts = optionsOf(fgOf.get(70));
        const side = opts.findIndex((o, a) => a > 0 && /옆 ?키/.test(o.note ?? ''));
        if (side > 0) { out.set(key(n), { alt: side, label: '옆키', why: `A4와 붙은 짧은 B♭4는 옆 키로 하면 손가락을 덜 움직여요` }); return; }
      }
      if (q && q.midi >= 71) out.set(key(n), { alt: 0, label: 'RH↓', why: '브레이크를 넘기 전에 오른손을 미리 내려 두세요' });
    });
  } else {
    // ── 3. 플룻 엄지 B♭ ──
    const isBnat = (n: ScoreNote | null | undefined) => !!n && ((n.midi % 12) + 12) % 12 === 11;
    notes.forEach((n, x) => {
      if (n.midi !== 70 && n.midi !== 82) return;
      if ((n.fifths ?? 0) > -1) return;
      const sameMeasure = notes.some((o) => o.measure === n.measure && isBnat(o));
      if (sameMeasure || isBnat(notes[x - 1]) || isBnat(notes[x + 1])) return;
      const opts = optionsOf(fgOf.get(n.midi));
      const th = opts.findIndex((o, a) => a > 0 && /엄지/.test(o.note ?? ''));
      if (th > 0) out.set(key(n), { alt: th, label: '엄지B♭', why: '내림표 조이고 가까이 B♮가 없으니 엄지 B♭ 키로 (손가락 하나로 끝나요)' });
    });
    // ── 4. E–F♯–G 사이 짧은 F♯ ──
    notes.forEach((n, x) => {
      if (n.midi !== 66 && n.midi !== 78) return;
      if (n.dur > 0.25 + 1e-9) return;
      const p = prevJ(x), q = nextJ(x);
      if (!p || !q) return;
      const E = n.midi - 2, G = n.midi + 1;
      if (!((p.midi === E && q.midi === G) || (p.midi === G && q.midi === E))) return;
      const opts = optionsOf(fgOf.get(n.midi));
      const mid = opts.findIndex((o, a) => a > 0 && /중지/.test(o.note ?? ''));
      if (mid > 0) out.set(key(n), { alt: mid, label: 'F♯중지', why: 'E와 G 사이의 빠른 F♯은 오른손 중지로 하면 더 매끄러워요' });
    });
  }
  return out;
}

/** 표시 설명 (악기마다) */
export const FING_LEGEND: Record<InstrumentId, { label: string; text: string }[]> = {
  clarinet: [
    { label: 'L', text: '왼손 새끼' },
    { label: 'R', text: '오른손 새끼' },
    { label: '옆키', text: 'B♭4 옆 키 운지' },
    { label: 'RH↓', text: '브레이크 전에 오른손 미리 내리기' },
  ],
  flute: [
    { label: '엄지B♭', text: '엄지 B♭ 키' },
    { label: 'F♯중지', text: 'F♯을 오른손 중지로' },
  ],
};
