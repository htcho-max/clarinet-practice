import type { ParsedScore } from './parse';

/**
 * 마디마다 박자: 박자표(중간에 바뀌면 그대로), 한 마디 길이, 한 박 길이(4분음표 단위),
 * 마디가 시작하는 박 위치 phase — 못갖춘마디는 비어 있는 앞 박들, 도돌이표 때문에 둘로 나눈 마디의 뒤쪽은 앞쪽 길이
 */
export function measureMeter(s: ParsedScore): Map<number, { beats: number; unit: number; nominal: number; beatQ: number; phase: number }> {
  const out = new Map<number, { beats: number; unit: number; nominal: number; beatQ: number; phase: number }>();
  let cur: [number, number] = s.time;
  let prev: { len: number; nominal: number; phase: number } | null = null;
  s.measures.forEach((m, k) => {
    cur = s.timeChanges?.get(m) ?? cur;
    const [beats, unit] = cur;
    const nominal = (beats * 4) / unit, beatQ = 4 / unit;
    const len = s.measureLen.get(m) ?? nominal;
    let phase = 0;
    if (len < nominal - 1e-6) {
      if (k === 0) phase = nominal - len; // 못갖춘마디
      else if (prev && prev.len < prev.nominal - 1e-6 && prev.phase === 0 && Math.abs(prev.len + len - nominal) < 1e-6) phase = prev.len; // 나눈 마디의 뒤쪽
    }
    out.set(m, { beats, unit, nominal, beatQ, phase });
    prev = { len, nominal, phase };
  });
  return out;
}

/**
 * 스윙: 박(4분음표) 안의 8분음표 두 개를 길게-짧게 (ratio = 앞 음 몫, 2/3 이면 2:1).
 * pos = 마디 안 위치(4분음표 단위) + 마디 시작 박 위치(phase). 박 위의 위치(정수)는 그대로
 */
export function swingBeat(pos: number, ratio: number): number {
  const q = Math.floor(pos + 1e-9), f = pos - q;
  if (f < 1e-9) return pos;
  return q + (f <= 0.5 ? f * 2 * ratio : ratio + (f - 0.5) * 2 * (1 - ratio));
}
/** 악보의 스윙 → (마디, 마디 안 박 위치) → 스윙한 박 위치. 스윙이 아니면 null. 6/8 같은 겹박자는 그대로 */
export function makeSwing(s: ParsedScore, ratio = s.swing): ((m: number, beat: number) => number) | null {
  if (!ratio || Math.abs(ratio - 0.5) < 1e-3) return null;
  const meter = measureMeter(s);
  return (m, beat) => {
    const mt = meter.get(m);
    if (!mt || (mt.unit === 8 && mt.beats % 3 === 0)) return beat;
    return swingBeat(beat + mt.phase, ratio) - mt.phase;
  };
}
