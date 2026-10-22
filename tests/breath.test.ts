// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { planBreaths, breathFromLongTones, GapDetector, gapsToAfterKeys, checkBreaths, durName } from '../src/score/breath';
import { parseMusicXML, type ParsedScore, type ScoreNote, type Art } from '../src/score/parse';
import type { Scored } from '../src/score/align';

/** 마디마다 [midi(0 = 쉼표), 길이, art?] */
function make(bars: [number, number, Art?][][], time: [number, number] = [4, 4]): ParsedScore {
  const notes: ScoreNote[] = [];
  const measureLen = new Map<number, number>();
  const nominal = (time[0] * 4) / time[1];
  const pickup = bars[0].reduce((a, x) => a + x[1], 0) < nominal - 0.01;
  const measures = bars.map((_, i) => (pickup ? i : i + 1));
  bars.forEach((b, i) => {
    let beat = 0, k = 0;
    for (const [midi, dur, art] of b) {
      if (midi) notes.push({ measure: measures[i], index: k++, midi, beat, dur, art: art ?? {}, fifths: 0 });
      beat += dur;
    }
    measureLen.set(measures[i], beat);
  });
  return { title: 't', measures, notes, measureLen, time, parts: [''], transpose: 0, bars: [] };
}
const q = (m: number, art?: Art): [number, number, Art?] => [m, 1, art];
const h = (m: number, art?: Art): [number, number, Art?] => [m, 2, art];
const afters = (p: ReturnType<typeof planBreaths>) => p.marks.map((m) => m.after);

describe('숨 쉬는 곳 추천', () => {
  it('쉼표가 있으면 쉼표에서 (큰 숨)', () => {
    const s = make([[q(60), q(62), q(64), q(65)], [q(67), q(65), q(64), [0, 1]], [q(60), q(62), q(64), q(65)], [h(67), h(60)]]);
    const p = planBreaths(s, { bpm: 60, capSec: 9 });
    expect(afters(p)).toEqual(['2:2']);
    expect(p.marks[0]).toMatchObject({ kind: 'big', rest: true, src: 'auto' });
    expect(p.restAfter.has('2:2')).toBe(true);
  });
  it('숨 길이를 넘지 않게, 프레이즈 끝(긴 음)을 골라요', () => {
    const bar = [q(60), q(62), q(64), q(65)], end = [h(67), h(64)];
    const s = make([bar, end, bar, end, bar, end, bar, [[60, 4]]]);
    const p = planBreaths(s, { bpm: 60, capSec: 9 });
    expect(p.longestSec).toBeLessThanOrEqual(9);
    // 2마디마다 2분음표 끝 (마디 끝)
    expect(afters(p)).toEqual(['2:1', '4:1', '6:1']);
    expect(p.marks[0].why).toContain('2마디');
    expect(p.marks[1].why).toContain('4마디 프레이즈');
  });
  it('숨이 넉넉하면 덜 자주', () => {
    const bar = [q(60), q(62), q(64), q(65)], end = [h(67), h(64)];
    const s = make([bar, end, bar, end, bar, end, bar, [[60, 4]]]);
    const p = planBreaths(s, { bpm: 60, capSec: 20 });
    expect(afters(p)).toEqual(['4:1']);
  });
  it('못갖춘마디 곡은 여린박 음 앞에서 (긴 음 끝)', () => {
    // 3/4, 여린박 1박: 0: G | C h E q | D h. ... 2마디마다 h + 여린박 q
    const s = make([[q(67)], [h(72), q(76)], [h(74), q(67)], [h(72), q(76)], [h(74), q(67)], [h(72), q(76)], [[74, 3]]], [3, 4]);
    const p = planBreaths(s, { bpm: 60, capSec: 7 });
    // 2마디째 2분음표 D 다음 (여린박 G 앞)
    expect(afters(p)).toContain('2:0');
    expect(afters(p)).not.toContain('2:1');
  });
  it('이음줄 중간은 피해요', () => {
    const sl = { slurNext: true };
    const s = make([[q(60, sl), q(62, sl), q(64, sl), q(65, sl)], [q(67, sl), q(65, sl), q(64), q(62, sl)], [q(60, sl), q(62, sl), q(64, sl), q(65, sl)], [h(67, sl), h(60)]]);
    const p = planBreaths(s, { bpm: 60, capSec: 9 });
    expect(afters(p)).toEqual(['2:2']);
  });
  it('내가 뺀 곳·넣은 곳, 악보의 숨표', () => {
    const bar = [q(60), q(62), q(64), q(65)], end = [h(67), h(64)];
    const s = make([bar, end, bar, [[60, 4]]]);
    const base = planBreaths(s, { bpm: 60, capSec: 9 });
    expect(afters(base)).toEqual(['2:1']);
    const del = planBreaths(s, { bpm: 60, capSec: 9, del: ['2:1'] });
    expect(afters(del)).not.toContain('2:1');
    expect(del.marks.length).toBeGreaterThan(0); // 숨이 모자라니 다른 곳을 골라요
    const add = planBreaths(s, { bpm: 60, capSec: 30, add: ['1:1'] });
    expect(afters(add)).toEqual(['1:1']);
    expect(add.marks[0].src).toBe('mine');
    const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><notations><articulations><breath-mark/></articulations></notations></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration></note></measure>
      <measure number="2"><note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;
    const ps = parseMusicXML(xml);
    const sp = planBreaths(ps, { bpm: 60, capSec: 30 });
    expect(sp.marks.map((m) => [m.after, m.src])).toEqual([['1:1', 'score']]);
  });
  it('미리 알림: 숨 직전 음, 짧으면 한 음 더 앞', () => {
    const s = make([[q(60), q(62), q(64), [0, 1]], [h(67), h(60)]]);
    const slow = planBreaths(s, { bpm: 60, capSec: 9 });
    expect([...slow.alert.keys()]).toEqual(['1:2']);
    const fast = planBreaths(s, { bpm: 120, capSec: 3 });
    expect([...fast.alert.keys()].sort()).toEqual(['1:1', '1:2']);
  });
  it('음표 이름', () => {
    expect(durName(2)).toBe('2분음표');
    expect(durName(1.5)).toBe('점4분음표');
  });
});

describe('숨 길이', () => {
  it('롱톤 기록 3번 이상이면 잘 분 기록의 75%', () => {
    expect(breathFromLongTones([10, 12, 14, 16, 8], 'flute')).toEqual({ sec: 12, auto: true, n: 5 });
    expect(breathFromLongTones([10], 'flute')).toEqual({ sec: 6, auto: false, n: 1 });
    expect(breathFromLongTones([], 'clarinet').sec).toBe(8);
    expect(breathFromLongTones([2, 2, 2], 'flute').sec).toBe(3);
  });
});

describe('채점: 숨 쉰 곳', () => {
  it('끊긴 곳 찾기', () => {
    const g = new GapDetector();
    for (let t = 0; t < 1; t += 0.03) g.push(t, true);
    for (let t = 1; t < 1.4; t += 0.03) g.push(t, false);
    for (let t = 1.4; t < 2; t += 0.03) g.push(t, true);
    for (let t = 2; t < 2.1; t += 0.03) g.push(t, false); // 짧은 끊김은 무시
    for (let t = 2.1; t < 3; t += 0.03) g.push(t, true);
    expect(g.gaps.length).toBe(1);
    expect(g.gaps[0][0]).toBeCloseTo(0.99, 1);
  });
  it('추천과 비교', () => {
    const sl = { slurNext: true };
    const s = make([[q(60), q(62), q(64), q(65)], [h(67), h(64)], [q(60, sl), q(62), q(64), q(65)], [[60, 4]]]);
    const plan = planBreaths(s, { bpm: 60, capSec: 9 });
    expect(afters(plan)).toEqual(['2:1']);
    const rs: Scored[] = s.notes.map((n, i) => ({ note: n, status: 'ok', cents: 0, playedMidi: n.midi, playedStart: i }));
    // 2:1 다음(=3:0 시작 전)과 3:0 다음(이음줄 중간)에서 끊김
    const taken = gapsToAfterKeys(rs, [[5.6, 6.0], [6.7, 7.0]]);
    expect(taken).toEqual(['2:1', '3:0']);
    const c = checkBreaths(plan, rs, taken);
    expect(c.hit).toEqual(['2:1']);
    expect(c.off).toEqual([{ after: '3:0', measure: 3, slur: true }]);
    expect(c.msg).toContain('1곳 중 1곳');
    expect(c.msg).toContain('3마디(이음줄 중간)');
  });
});
