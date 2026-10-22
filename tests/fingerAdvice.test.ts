import { describe, it, expect } from 'vitest';
import { adviseFingering, pinkyOf, FING_LEGEND } from '../src/score/fingerAdvice';
import { CLARINET, FLUTE } from '../src/instruments/profiles';
import type { ScoreNote } from '../src/score/parse';

/** 4/4 한 마디에 음들 (dur 4분음표 단위), 쉼표는 midi null */
function score(seq: [number | null, number][], fifths = 0, perMeasure = 4) {
  const notes: ScoreNote[] = [];
  let pos = 0;
  for (const [midi, dur] of seq) {
    const measure = Math.floor(pos / perMeasure) + 1, beat = pos - (measure - 1) * perMeasure;
    if (midi !== null) notes.push({ measure, index: notes.filter((n) => n.measure === measure).length, midi, beat, dur, fifths });
    pos += dur;
  }
  const n = Math.max(1, Math.ceil(pos / perMeasure));
  return { notes, measures: Array.from({ length: n }, (_, i) => i + 1), measureLen: new Map(Array.from({ length: n }, (_, i) => [i + 1, perMeasure])), time: [4, 4] as [number, number] };
}
const cl = (seq: [number | null, number][]) => adviseFingering(score(seq), 'clarinet', CLARINET.fingerings);
const fl = (seq: [number | null, number][], fifths = 0) => adviseFingering(score(seq, fifths), 'flute', FLUTE.fingerings);
const labels = (m: Map<string, { label: string }>) => [...m.entries()].map(([k, v]) => `${k}=${v.label}`);

describe('운지 추천 · 클라리넷 새끼손가락', () => {
  it('새끼 키 알아보기', () => {
    expect(pinkyOf(['thumb', 'lEB'])).toEqual({ hand: 'L', key: 'EB' });
    expect(pinkyOf(['reg', 'rAb'])).toEqual({ hand: 'R', key: 'Ab' });
    expect(pinkyOf(['thumb', 'l1'])).toBeNull();
  });
  it('B4→C♯5: C♯ 을 왼손으로 두고 B4 는 오른손', () => {
    const a = cl([[71, 1], [73, 1]]);
    expect(labels(a)).toEqual(['1:0=R', '1:1=L']);
    expect(a.get('1:0')!.alt).toBe(1);
    expect(a.get('1:0')!.why).toMatch(/B4→C♯5.*B4는 오른손 새끼로/);
  });
  it('C5→B4→C5: 번갈아 (C5 오른손, B4 왼손)', () => {
    expect(labels(cl([[72, 1], [71, 1], [72, 1]]))).toEqual(['1:0=R', '1:1=L', '1:2=R']);
  });
  it('샬뤼모 E3→F3', () => {
    expect(labels(cl([[52, 1], [53, 1]]))).toEqual(['1:0=L', '1:1=R']);
  });
  it('한 손만 있는 키(A♭/E♭ 오른손)는 그대로, 앞 음을 왼손으로', () => {
    // C5(오른손 기본) → D♯5(오른손만): C5 를 왼손으로
    const a = cl([[72, 1], [75, 1]]);
    expect(labels(a)).toEqual(['1:0=L', '1:1=R']);
    expect(a.get('1:1')!.alt).toBe(0);
  });
  it('따로 떨어진 새끼 음, 같은 음 되풀이, 쉼표로 끊긴 음은 표시 안 함', () => {
    expect(cl([[71, 1], [74, 1], [76, 1]]).size).toBe(0);
    expect(cl([[71, 1], [71, 1]]).size).toBe(0);
    expect(cl([[71, 1], [null, 1], [73, 1]]).size).toBe(0);
  });
});

describe('운지 추천 · 클라리넷 스로트', () => {
  it('A4 와 붙은 짧은 B♭4 는 옆키', () => {
    const a = cl([[69, 0.5], [70, 0.5], [69, 0.5], [70, 0.5]]);
    expect(a.get('1:1')).toMatchObject({ label: '옆키', alt: 1 });
    expect(a.get('1:3')?.label).toBe('옆키');
  });
  it('긴 B♭4 는 옆키 아님', () => {
    expect(cl([[69, 1], [70, 2]]).get('1:1')).toBeUndefined();
  });
  it('스로트 음에서 바로 브레이크 위로 → RH↓', () => {
    const a = cl([[67, 1], [72, 1]]);
    expect(a.get('1:0')).toMatchObject({ label: 'RH↓', alt: 0 });
    expect(cl([[67, 1], [null, 1], [72, 1]]).size).toBe(0);
  });
});

describe('운지 추천 · 플룻', () => {
  it('F장조 B♭ 은 엄지 B♭', () => {
    const a = fl([[67, 1], [70, 1], [72, 1]], -1);
    expect(a.get('1:1')).toMatchObject({ label: '엄지B♭', alt: 1 });
  });
  it('B♮ 가 가까이 있거나 같은 마디에 있으면 1·1 그대로', () => {
    expect(fl([[71, 1], [70, 1], [69, 1]], -1).size).toBe(0);
    expect(fl([[70, 1], [67, 1], [65, 1], [71, 1]], -1).size).toBe(0);
  });
  it('올림표·조표 없는 조에서는 엄지 B♭ 안 함', () => {
    expect(fl([[69, 1], [70, 1]], 0).size).toBe(0);
    expect(fl([[69, 1], [70, 1]], 2).size).toBe(0);
  });
  it('E–F♯–G 사이 짧은 F♯ 은 오른손 중지', () => {
    const a = fl([[64, 0.25], [66, 0.25], [67, 0.25]], 1);
    expect(a.get('1:1')).toMatchObject({ label: 'F♯중지', alt: 1 });
    expect(fl([[64, 1], [66, 1], [67, 1]], 1).size).toBe(0);
    expect(fl([[62, 0.25], [66, 0.25], [67, 0.25]], 1).size).toBe(0);
  });
  it('설명 표', () => {
    expect(FING_LEGEND.clarinet.map((x) => x.label)).toContain('L');
    expect(FING_LEGEND.flute.map((x) => x.label)).toContain('엄지B♭');
  });
});
