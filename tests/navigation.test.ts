// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXML, playOrder, hasRepeats } from '../src/score/parse';
import { planPlayback, measureMeter } from '../src/score/player';

const n = (step: string, dur: number) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`;
const words = (t: string) => `<direction placement="above"><direction-type><words>${t}</words></direction-type></direction>`;
const bar = (dir: 'forward' | 'backward', loc = dir === 'forward' ? 'left' : 'right') => `<barline location="${loc}"><repeat direction="${dir}"/></barline>`;
const ending = (num: string, type: string, loc: string) => `<barline location="${loc}"><ending number="${num}" type="${type}"/></barline>`;
const attrs = (beats = 4, type = 4) => `<attributes><divisions>1</divisions><time><beats>${beats}</beats><beat-type>${type}</beat-type></time></attributes>`;
const doc = (ms: [string, string][], first = attrs()) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">${ms
  .map(([num, body], i) => `<measure number="${num}"${i === 0 && num === '0' ? ' implicit="yes"' : ''}>${i === 0 ? first : ''}${body}</measure>`).join('')}</part></score-partwise>`;

describe('못갖춘마디 + 마디 안 도돌이표 (나눈 마디)', () => {
  // 3/4, 여린박 1박. 4마디는 2박에서 :| (나눈 마디, implicit 표시 없음), 5마디는 남은 1박 |: … 7마디 2박 :|
  const xml = doc([
    ['0', n('G', 1)],
    ['1', n('C', 3)], ['2', n('D', 3)], ['3', n('E', 3)],
    ['4', n('F', 2) + bar('backward')],
    ['5', bar('forward') + n('A', 1)],
    ['6', n('B', 3)],
    ['7', n('C', 2) + bar('backward')],
  ], attrs(3, 4));
  const s = parseMusicXML(xml);
  it('마디 길이는 적힌 만큼 (빈 박을 채우지 않음)', () => {
    expect([0, 1, 4, 5, 7].map((m) => s.measureLen.get(m))).toEqual([1, 3, 2, 1, 2]);
  });
  it('펼친 순서', () => {
    expect(playOrder(s)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 6, 7, 5, 6, 7]);
  });
  it('도돌이표를 넘어갈 때 쉬지 않고 이어짐', () => {
    const p = planPlayback(s, { bpm: 60, from: 0, to: 7, countIn: false, order: playOrder(s) });
    for (let i = 1; i < p.events.length; i++) {
      const a = p.events[i - 1];
      expect(p.events[i].time).toBeCloseTo(a.time + a.dur, 6);
    }
  });
  it('박: 여린박은 셋째 박, 나눈 마디 뒤쪽도 박 위치 이어서', () => {
    const mt = measureMeter(s);
    expect(mt.get(0)!.phase).toBe(2);
    expect(mt.get(5)!.phase).toBe(2);
    expect(mt.get(7)!.phase).toBe(0);
    const p = planPlayback(s, { bpm: 60, from: 0, to: 7, countIn: true, order: playOrder(s) });
    // 카운트인 = 한 마디(3박) + 여린박 앞 2박
    expect(p.events[0].time).toBeCloseTo(5, 6);
    const at = (t: number) => p.clicks.find((c) => Math.abs(c.time - t) < 1e-6);
    expect(at(0)!.accent).toBe(true);
    expect(at(3)!.accent).toBe(true);
    expect(at(5)!.accent).toBe(false); // 여린박
    expect(at(6)!.accent).toBe(true); // 1마디 첫 박
    // 5마디(나눈 뒤쪽, 1박) = 셋째 박 → 강세 없음, 6마디 첫 박은 강세
    const t5 = p.events.find((e) => e.note.measure === 5)!.time;
    expect(at(t5)!.accent).toBe(false);
    expect(at(t5 + 1)!.accent).toBe(true);
  });
});

describe('D.C.·D.S.·Fine·코다', () => {
  it('D.C. al Fine (글자)', () => {
    const s = parseMusicXML(doc([['1', n('C', 4)], ['2', n('D', 4) + words('Fine')], ['3', n('E', 4)], ['4', n('F', 4) + words('D.C. al Fine')]]));
    expect(hasRepeats(s)).toBe(true);
    expect(playOrder(s)).toEqual([1, 2, 3, 4, 1, 2]);
  });
  it('D.S. al Coda (세뇨·To Coda·Coda)', () => {
    const segno = '<direction><direction-type><segno/></direction-type></direction>';
    const s = parseMusicXML(doc([['1', n('C', 4)], ['2', segno + n('D', 4)], ['3', n('E', 4) + words('To Coda')], ['4', n('F', 4) + words('D.S. al Coda')], ['5', words('Coda') + n('G', 4)], ['6', n('A', 4)]]));
    expect(playOrder(s)).toEqual([1, 2, 3, 4, 2, 3, 5, 6]);
  });
  it('<sound> 속성 · 코다 기호 두 번', () => {
    const coda = '<direction><direction-type><coda/></direction-type></direction>';
    const s = parseMusicXML(doc([['1', n('C', 4)], ['2', n('D', 4) + coda], ['3', n('E', 4) + '<sound dacapo="yes"/>'], ['4', coda + n('G', 4)]]));
    expect(playOrder(s)).toEqual([1, 2, 3, 1, 2, 4]);
  });
  it('도돌이표·괄호 뒤 D.C.: 되돌아온 뒤에는 반복 없이 마지막 괄호만', () => {
    const s = parseMusicXML(doc([
      ['1', bar('forward') + n('C', 4)],
      ['2', ending('1', 'start', 'left') + n('D', 4) + ending('1', 'stop', 'right') + bar('backward')],
      ['3', ending('2', 'start', 'left') + n('E', 4) + words('Fine') + ending('2', 'stop', 'right')],
      ['4', n('F', 4) + words('D.C.')],
    ]));
    expect(playOrder(s)).toEqual([1, 2, 1, 3, 4, 1, 3]);
  });
});

describe('악보 중간의 템포·박자표', () => {
  it('♩=60 → ♩=120: 그 뒤는 두 배 빠르게 (재생 템포에 대한 배율)', () => {
    const tempo = (b: number) => `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${b}</per-minute></metronome></direction-type><sound tempo="${b}"/></direction>`;
    const s = parseMusicXML(doc([['1', tempo(60) + n('C', 4)], ['2', tempo(120) + n('D', 2) + n('E', 2)]]));
    expect(s.tempo).toBe(60);
    const p = planPlayback(s, { bpm: 80, from: 1, to: 2, countIn: false });
    const q = 60 / 80;
    expect(p.events.map((e) => +(e.time / q).toFixed(6))).toEqual([0, 4, 5]);
    expect(p.total / q).toBeCloseTo(6, 6);
  });
  it('4/4 → 3/4: 박·강세가 마디 박자대로', () => {
    const s = parseMusicXML(doc([['1', n('C', 4)], ['2', attrs(3, 4) + n('D', 3)], ['3', n('E', 3)]]));
    expect(s.timeChanges?.get(2)).toEqual([3, 4]);
    const p = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false });
    expect(p.clicks.map((c) => c.time)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(p.clicks.filter((c) => c.accent).map((c) => c.time)).toEqual([0, 4, 7]);
  });
});

describe('표현: 숨표·accel.·쉼표 늘임표', () => {
  const xml = doc([
    ['1', n('C', 2).replace('</note>', '<notations><articulations><breath-mark/></articulations></notations></note>') + n('D', 2)],
    ['2', '<note><rest/><duration>2</duration><voice>1</voice><notations><fermata/></notations></note>' + n('E', 2)],
    ['3', words('accel.') + n('F', 1) + n('G', 1) + n('A', 1) + n('B', 1)],
  ]);
  const s = parseMusicXML(xml);
  const p = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false, expressive: true });
  const plain = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false });
  it('숨표 음은 짧게 끊음', () => {
    expect(p.events[0].len!).toBeLessThan(p.events[0].dur - 0.1);
  });
  it('늘임표 쉼표 뒤 음은 늦게', () => {
    expect(s.notes[2].art?.restFermata).toBe(2);
    expect(p.events[2].time).toBeGreaterThan(plain.events[2].time + 1);
  });
  it('accel. 은 점점 빠르게', () => {
    const d = p.events.slice(3).map((e) => e.dur);
    expect(d[3]).toBeLessThan(d[0]);
    expect(d[0]).toBeLessThanOrEqual(1);
  });
});
