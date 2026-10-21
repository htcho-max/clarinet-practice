/**
 * 악보 조 바꾸기 (MusicXML 그대로 옮기기).
 * 반음 수만큼 옮기되, 조표가 가장 적은 철자를 골라 온음계 간격으로 옮겨요
 * (예: G장조 +2 → A장조, C장조 +1 → D♭장조). 조표·임시표 관계는 그대로 유지돼요.
 */
const LETTERS = 'CDEFGAB';
const SEMI = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];

/** 조표(fifths) 이름: "G장조" / "E단조" */
export function keyName(fifths: number, mode: string = 'major'): string {
  const i = fifths + 7;
  if (i < 0 || i > 14) return `조표 ${fifths}`;
  return mode === 'minor' ? `${MINOR[i]}단조` : `${MAJOR[i]}장조`;
}

/** 반음 s 만큼 옮길 때 5도 몇 칸 옮길지 (결과 조표가 가장 적은 쪽) */
export function fifthsShift(fifths: number, s: number): number {
  const base = (((7 * s) % 12) + 12) % 12; // 7k ≡ s (mod 12) → k ≡ 7s
  let best = base, bestAbs = Infinity;
  // 조표가 가장 적은 쪽. 같으면(F♯/G♭ 처럼 6개) 올림 쪽
  for (const k of [base - 24, base - 12, base, base + 12]) {
    const f = fifths + k, a = Math.abs(f);
    if (a > 7) continue;
    if (a < bestAbs || (a === bestAbs && f > fifths + best)) { best = k; bestAbs = a; }
  }
  return best;
}

/** 한 음 옮기기: 글자는 5도 칸 수만큼(5도 = 온음계 4칸), 높이는 정확히 s 반음 */
export function movePitch(step: string, alter: number, octave: number, s: number, k: number): { step: string; alter: number; octave: number } {
  const li = LETTERS.indexOf(step);
  const midi = 12 * (octave + 1) + SEMI[li] + alter + s;
  const nl = (li + ((4 * k) % 7 + 7) % 7) % 7;
  // 새 글자의 자연음 가운데 목표에 가장 가까운 옥타브
  let best = { octave: 4, alter: 99 };
  for (let o = -1; o <= 9; o++) {
    const a = midi - (12 * (o + 1) + SEMI[nl]);
    if (Math.abs(a) < Math.abs(best.alter)) best = { octave: o, alter: a };
  }
  return { step: LETTERS[nl], alter: best.alter, octave: best.octave };
}

const ACC_NAME: Record<string, string> = { '-2': 'flat-flat', '-1': 'flat', '0': 'natural', '1': 'sharp', '2': 'double-sharp' };

/** 첫 파트(또는 part 번째)의 처음 조표 */
export function scoreKey(xml: string, part = 0): { fifths: number; mode: string } | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const p = doc.getElementsByTagName('part')[part];
  const k = p?.getElementsByTagName('key')[0];
  if (!k) return null;
  return { fifths: Number(k.getElementsByTagName('fifths')[0]?.textContent ?? 0) || 0, mode: k.getElementsByTagName('mode')[0]?.textContent?.trim() || 'major' };
}

/** MusicXML 을 s 반음 옮기기 (파트마다 자기 조표 기준) */
export function transposeXml(xml: string, s: number): string {
  if (!s) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return xml;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const first = part.getElementsByTagName('key')[0];
    const f0 = Number(first?.getElementsByTagName('fifths')[0]?.textContent ?? 0) || 0;
    const k = fifthsShift(f0, s);
    for (const key of Array.from(part.getElementsByTagName('key'))) {
      const fe = key.getElementsByTagName('fifths')[0];
      if (!fe) continue;
      let f = (Number(fe.textContent) || 0) + k;
      while (f > 7) f -= 12;
      while (f < -7) f += 12;
      fe.textContent = String(f);
    }
    for (const p of Array.from(part.getElementsByTagName('pitch'))) {
      const stepEl = p.getElementsByTagName('step')[0], octEl = p.getElementsByTagName('octave')[0];
      if (!stepEl || !octEl) continue;
      let altEl = p.getElementsByTagName('alter')[0];
      const r = movePitch(stepEl.textContent!.trim(), Number(altEl?.textContent ?? 0) || 0, Number(octEl.textContent), s, k);
      stepEl.textContent = r.step;
      octEl.textContent = String(r.octave);
      if (r.alter) {
        if (!altEl) { altEl = doc.createElement('alter'); p.insertBefore(altEl, octEl); }
        altEl.textContent = String(r.alter);
      } else if (altEl) altEl.remove();
      // 적혀 있던 임시표는 새 높이에 맞게
      const note = p.parentElement;
      const acc = note?.getElementsByTagName('accidental')[0];
      if (acc) acc.textContent = ACC_NAME[String(r.alter)] ?? acc.textContent;
    }
  }
  return new XMLSerializer().serializeToString(doc);
}
