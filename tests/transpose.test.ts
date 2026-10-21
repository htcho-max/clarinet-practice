// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { transposeXml, fifthsShift, movePitch, keyName, scoreKey } from '../src/score/transpose';
import { parseMusicXML } from '../src/score/parse';

const note = (step: string, alter: number, oct: number, acc = '') => `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type>${acc ? `<accidental>${acc}</accidental>` : ''}</note>`;
const doc = (fifths: number, notes: string, mode = 'major') => `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`;

describe('조 바꾸기', () => {
  it('조표가 가장 적은 철자', () => {
    expect(keyName(0 + fifthsShift(0, 1))).toBe('D♭장조');
    expect(keyName(1 + fifthsShift(1, 2))).toBe('A장조');
    expect(keyName(0 + fifthsShift(0, 6))).toBe('F♯장조');
    expect(keyName(-3 + fifthsShift(-3, -2))).toBe('D♭장조');
    expect(keyName(0 + fifthsShift(0, -3), 'minor')).toBe('F♯단조');
  });
  it('음 하나: 글자와 높이', () => {
    expect(movePitch('F', 1, 5, 2, 2)).toEqual({ step: 'G', alter: 1, octave: 5 }); // G장조 F♯ → A장조 G♯
    expect(movePitch('B', 0, 4, 1, -5)).toEqual({ step: 'C', alter: 0, octave: 5 }); // C장조 B4 → D♭장조 C5
    expect(movePitch('C', 0, 5, -2, -2)).toEqual({ step: 'B', alter: -1, octave: 4 });
  });
  it('악보 전체: 조표·높이·임시표, 음 수는 그대로', () => {
    const x = doc(1, note('G', 0, 4) + note('F', 1, 5) + note('F', 0, 5, 'natural') + note('C', 1, 5, 'sharp'));
    const y = transposeXml(x, 2);
    expect(scoreKey(y)).toEqual({ fifths: 3, mode: 'major' });
    const a = parseMusicXML(x), b = parseMusicXML(y);
    expect(b.notes.map((n) => n.midi)).toEqual(a.notes.map((n) => n.midi + 2));
    expect(b.notes.map((n) => n.acc ?? '')).toEqual(['', 'G♯', '', 'D♯']);
    expect(y).toContain('<accidental>natural</accidental>');
    expect(y).toContain('<accidental>sharp</accidental>');
    expect(transposeXml(x, 0)).toBe(x);
  });
  it('옮긴 뒤 다시 되돌리면 같은 높이', () => {
    const x = doc(-2, note('B', -1, 4) + note('E', -1, 5) + note('A', 0, 5), 'major');
    const back = transposeXml(transposeXml(x, 5), -5);
    expect(parseMusicXML(back).notes.map((n) => n.midi)).toEqual(parseMusicXML(x).notes.map((n) => n.midi));
    expect(scoreKey(back)?.fifths).toBe(-2);
  });
});

import { makeExercise } from '../src/exercise/curriculum';
import { MAJOR_KEYS, MINOR_KEYS, relativeKey, keyById } from '../src/exercise/theory';

describe('장·단음계 악보', () => {
  const make = (key: string, inst: 'flute' | 'clarinet' = 'flute', form?: 'natural' | 'harmonic' | 'melodic', octaves = 2) =>
    makeExercise({ key, pattern: 'scaleSheet', positions: 'full', octaves, form }, { perBeat: 1, bowing: 'detache', seed: 1 }, inst);
  it('24조 모두 두 악기에서 만들어짐 (으뜸음에서 으뜸음까지)', () => {
    for (const inst of ['flute', 'clarinet'] as const) for (const k of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      const m = make(k.id, inst, 'harmonic');
      expect(m.error, `${inst} ${k.id}`).toBeUndefined();
      const s = parseMusicXML(m.xml);
      const ms = s.notes.map((n) => n.midi);
      expect(Math.max(...ms) - ms[0], `${inst} ${k.id}`).toBe(24);
      expect(ms[ms.length - 1] % 12).toBe(ms[0] % 12);
    }
  });
  it('E♭장조: 조표 3개, 음계 + 으뜸화음', () => {
    const m = make('Eb');
    expect(m.xml).toContain('<fifths>-3</fifths>');
    expect(m.title).toBe('E♭장조 음계 · 2옥타브');
    const s = parseMusicXML(m.xml);
    expect(new Set(s.notes.map((n) => n.acc).filter(Boolean))).toEqual(new Set(['E♭', 'A♭', 'B♭']));
  });
  it('단조 형태: 화성은 7음 올림(G♯단조 F𝄪), 가락은 내려올 때 자연', () => {
    const h = make('G#m', 'flute', 'harmonic');
    expect(h.xml).toContain('<accidental>double-sharp</accidental>');
    expect(h.title).toBe('G♯단조 (화성) 음계 · 2옥타브');
    const mel = parseMusicXML(make('Am', 'flute', 'melodic', 1).xml).notes.map((n) => n.midi);
    // A4 B C D E F♯ G♯ A5 G F E D C B A (+ 분산화음)
    expect(mel.slice(0, 15)).toEqual([69, 71, 72, 74, 76, 78, 80, 81, 79, 77, 76, 74, 72, 71, 69]);
    const nat = parseMusicXML(make('Am', 'flute', 'natural', 1).xml).notes.map((n) => n.midi);
    expect(nat.slice(5, 7)).toEqual([77, 79]);
  });
  it('나란한조', () => {
    expect(relativeKey(keyById('Eb')).id).toBe('Cm');
    expect(relativeKey(keyById('F#m')).id).toBe('A');
  });
});
