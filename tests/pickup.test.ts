// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXML, notesInRange, playOrder } from '../src/score/parse';
import { planPlayback } from '../src/score/player';
import { drawRangeFor } from '../src/score/osmd';
import { alignNotes } from '../src/score/align';
import { measureStats, reviewChanges } from '../src/data/review';

const note = (step: string, dur: number) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`;
const xml = (nums: string[], extra = '') => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">${nums
  .map((n, i) => `<measure number="${n}"${i === 0 ? ' implicit="yes"' : ''}>${i === 0 ? `<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${extra}` : ''}${note('A', 1)}</measure>`)
  .join('')}</part></score-partwise>`;

describe('못갖춘마디 0', () => {
  it('0 을 1번과 겹치지 않게 읽음', () => {
    const s = parseMusicXML(xml(['0', '1', '2']));
    expect(s.measures).toEqual([0, 1, 2]);
    expect(s.notes.map((n) => [n.measure, n.index])).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(s.measureLen.get(0)).toBe(1); // 못갖춘마디는 실제 길이
    expect(notesInRange(s, 0, 1).length).toBe(2);
  });
  it('번호가 없거나 겹치면 앞 번호 + 1', () => {
    expect(parseMusicXML(xml(['', '', '5', '5'])).measures).toEqual([1, 2, 5, 6]);
  });
  it('재생: 0번 마디부터, 시간이 이어짐', () => {
    const s = parseMusicXML(xml(['0', '1', '2']));
    const p = planPlayback(s, { bpm: 60, from: 0, to: 2, countIn: false });
    expect(p.events.map((e) => [e.note.measure, e.time])).toEqual([[0, 0], [1, 1], [2, 3]]);
  });
  it('도돌이표: 못갖춘마디부터 다시', () => {
    const rep = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${note('D', 1)}</measure>
<measure number="1">${note('G', 2)}</measure>
<measure number="2">${note('A', 1)}<barline location="right"><repeat direction="backward"/></barline></measure>
<measure number="3">${note('B', 2)}</measure></part></score-partwise>`;
    expect(playOrder(parseMusicXML(rep))).toEqual([0, 1, 2, 0, 1, 2, 3]);
  });
  it('채점·복습함: 0번 마디도 따로', () => {
    const s = parseMusicXML(`<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${note('D', 1)}</measure>
<measure number="1">${note('G', 2)}</measure><measure number="2">${note('A', 2)}</measure></part></score-partwise>`);
    const r = alignNotes(s.notes, [{ midi: 62, cents: 40, start: 0 }, { midi: 67, cents: 2, start: 1 }, { midi: 69, cents: 1, start: 2 }]);
    const st = measureStats(r);
    expect(st.map((x) => x.measure)).toEqual([0, 1, 2]);
    const c = reviewChanges(new Map(), st, 3, 't', '2026-10-20');
    expect(c.added).toEqual([0]);
    expect(c.put[0].id).toBe('3:0');
  });
});

describe('악보에 적힌 템포', () => {
  it('첫 <sound tempo> 를 4분음표 BPM 으로', () => {
    expect(parseMusicXML(xml(['1', '2'], '<direction><sound tempo="63"/></direction>')).tempo).toBe(63);
    expect(parseMusicXML(xml(['1', '2'])).tempo).toBeUndefined();
    expect(parseMusicXML(xml(['1'], '<direction><sound tempo="999"/></direction>')).tempo).toBeUndefined();
  });
});

describe('OSMD 그리기 구간', () => {
  it('못갖춘마디 0 이 있으면 순서가 하나 밀림', () => {
    expect(drawRangeFor([0, 1, 2, 3, 4], 0, 4)).toEqual({ drawFromMeasureNumber: 1, drawUpToMeasureNumber: 5 });
    expect(drawRangeFor([0, 1, 2, 3, 4], 2, 3)).toEqual({ drawFromMeasureNumber: 3, drawUpToMeasureNumber: 4 });
  });
  it('15마디부터 시작하는 악보', () => {
    expect(drawRangeFor([15, 16, 17, 18], 15, 16)).toEqual({ drawFromMeasureNumber: 1, drawUpToMeasureNumber: 2 });
    expect(drawRangeFor([15, 16, 17, 18], 17, 99)).toEqual({ drawFromMeasureNumber: 3, drawUpToMeasureNumber: 4 });
  });
});
