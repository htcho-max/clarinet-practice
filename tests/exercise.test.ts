// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { STEPS, makeExercise, RANGE_SETS } from '../src/exercise/curriculum';
import { midiOf } from '../src/exercise/theory';
import { parseMusicXML } from '../src/score/parse';
import { SONGS, BASICS, parseSong } from '../src/exercise/songs';
import { DIV } from '../src/exercise/build';

const full = RANGE_SETS.find((r) => r.id === 'full')!.r;

describe('모든 단계 악보 만들기', () => {
  for (const s of STEPS) {
    for (const perBeat of [0.5, 1, 2, 3, 4]) {
      it(`${s.id} ${perBeat}`, () => {
        const m = makeExercise(s.spec, { perBeat, bowing: 'slur2', seed: 3 });
        expect(m.error).toBeUndefined();
        const p = parseMusicXML(m.xml);
        for (const [, len] of p.measureLen) expect(len).toBe(4);
        expect(p.notes.length).toBeGreaterThan(8);
        // 음역: 클라리넷 E3~C6 안, 단계의 음역 안
        const r = RANGE_SETS.find((x) => x.id === s.spec.positions)!.r;
        for (const n of p.notes) { expect(n.midi).toBeGreaterThanOrEqual(r.lo); expect(n.midi).toBeLessThanOrEqual(Math.max(r.hi, full.lo)); }
        // 브레이크: 낮은 음역 단계는 넘지 않고, 4단계(D)는 꼭 넘음
        if (s.spec.positions === 'low') expect(m.breakKeys.length).toBe(0);
        if (s.stage === 'D') expect(m.breakKeys.length).toBeGreaterThan(0);
        // breakKeys 가 가리키는 음이 실제로 브레이크를 넘은 음
        const keyed = new Map(p.notes.map((n, i) => [`${n.measure}:${n.index}`, i]));
        for (const k of m.breakKeys) {
          const i = keyed.get(k)!;
          expect(i).toBeGreaterThan(0);
          const a = p.notes[i - 1].midi, b = p.notes[i].midi;
          expect((a <= 70 && b >= 71) || (a >= 71 && b <= 70)).toBe(true);
        }
      });
    }
  }
});

describe('D6 F장조는 F4에서 시작해 브레이크를 넘음', () => {
  it('F4~F5', () => {
    const s = STEPS.find((x) => x.id === 'D6')!;
    const p = parseMusicXML(makeExercise(s.spec, { perBeat: 1, bowing: 'detache', seed: 1 }).xml);
    expect(p.notes[0].midi).toBe(65);
    expect(Math.max(...p.notes.map((n) => n.midi))).toBe(77);
  });
});

describe('쉬운 곡', () => {
  for (const s of [...BASICS, ...SONGS]) {
    it(s.id, () => {
      const notes = parseSong(s.text);
      const total = notes.reduce((a, n) => a + n.dur, 0);
      expect(total % (4 * DIV)).toBe(0);
      for (const n of notes) if (n.p) { expect(midiOf(n.p)).toBeGreaterThanOrEqual(52); expect(midiOf(n.p)).toBeLessThanOrEqual(77); }
    });
  }
  it('점음표·쉼표·임시표', () => {
    const n = parseSong('E4:q. D4:e r:h | F#4:q Bb4:q G#4:h');
    expect(n.map((x) => x.dur)).toEqual([36, 12, 48, 24, 24, 48]);
    expect(n[2].p).toBeNull();
    expect(midiOf(n[3].p!)).toBe(66);
    expect(midiOf(n[4].p!)).toBe(70);
    expect(midiOf(n[5].p!)).toBe(68);
  });
});

import { ART_BASES, ART_VARIANTS, ART_KEYS } from '../src/exercise/articulation';
describe('텅잉·슬러 연습', () => {
  for (const b of ART_BASES) for (const k of ART_KEYS) for (const v of ART_VARIANTS) {
    it(`${b.id} ${k} ${v.id}`, () => {
      const m = makeExercise({ key: k, pattern: 'art', positions: 'cross', base: b.id, variant: v.id }, { perBeat: 2, bowing: 'detache', seed: 1 });
      expect(m.error).toBeUndefined();
      const p = parseMusicXML(m.xml);
      expect(p.measures.length).toBe(3);
      for (const [, len] of p.measureLen) expect(len).toBe(4);
      expect(p.notes.length).toBe(17);
      for (const n of p.notes) { expect(n.midi).toBeGreaterThanOrEqual(52); expect(n.midi).toBeLessThanOrEqual(77); }
      if (b.id === 'break') expect(m.breakKeys.length).toBeGreaterThan(0);
      if (b.id === 'five') expect(m.breakKeys.length).toBe(0);
      if (v.pattern.groups[0] > 1) expect(m.xml).toContain('<slur type="start"');
      if (v.pattern.stacc) expect(m.xml).toContain('<staccato/>');
    });
  }
});

describe('2분음표 리듬은 마디를 넘으면 붙임줄', () => {
  it('붙임줄로 이어져 채점에서는 한 음', () => {
    const m = makeExercise({ key: 'G', pattern: 'scale', positions: 'low', octaves: 1 }, { perBeat: 0.5, bowing: 'detache', seed: 1 });
    const p = parseMusicXML(m.xml);
    expect(p.notes.length).toBe(15); // G3~G4 올라가기 8 + 내려오기 7 (붙임줄 음은 하나로)
    for (const [, len] of p.measureLen) expect(len).toBe(4);
  });
});

import { guessFolder } from '../src/data/folders';
describe('악보 폴더 짐작', () => {
  it('연결한 곡의 분류', () => expect(guessFolder('아무 제목', 3)).toBe('book-3'));
  it('합주 곡 제목', () => expect(guessFolder('Concert Band - Clarinet 2')).toBe('book-3'));
  it('교재 곡 제목', () => expect(guessFolder('Rubank 12번 연습', undefined, new Map([[1, ['Rubank 12번']]]))).toBe('book-1'));
  it('그 밖의 곡', () => expect(guessFolder('Carol of the Bells')).toBe('other'));
});
