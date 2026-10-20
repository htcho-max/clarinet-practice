// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXML, parseTracked, neighbors } from '../src/score/parse';
import { expandOrnaments, planPlayback, GRACE } from '../src/score/player';
import { toRunNotes, fromRunNotes, runInsight, dynCompare, meanDb } from '../src/score/practice';
import { editNote } from '../src/score/edit';
import type { Scored } from '../src/score/align';

const n = (step: string, oct: number, dur: number, type: string, extra = '', notations = '', alter = 0) =>
  `<note>${extra.includes('<grace') ? extra : ''}<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch>${extra.includes('<grace') ? '' : `<duration>${dur}</duration>${extra}`}<voice>1</voice><type>${type}</type>${notations ? `<notations>${notations}</notations>` : ''}</note>`;
const dir = (inner: string) => `<direction><direction-type>${inner}</direction-type></direction>`;
const doc = (ms: string[], fifths = 0) => `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Cl</part-name></score-part></part-list><part id="P1">${ms.map((m, i) => `<measure number="${i}"${i === 0 ? ' implicit="yes"' : ''}>${i === 0 ? `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>` : ''}${m}</measure>`).join('')}</part></score-partwise>`;

describe('꾸밈음·트릴', () => {
  const XML = doc([
    n('D', 4, 2, 'quarter'),
    n('G', 4, 4, 'half', '', '<ornaments><trill-mark/></ornaments>') + n('C', 5, 0, 'eighth', '<grace/>') + n('B', 4, 4, 'half', '', '<slur type="start"/>'),
    n('A', 4, 8, 'whole', '', '<slur type="stop"/><fermata/>'),
  ], 1);
  const s = parseMusicXML(XML);
  it('트릴은 조성 안 위 음, 꾸밈음은 채점에서 빼고 다음 음에', () => {
    expect(s.notes.map((x) => x.midi)).toEqual([62, 67, 71, 69]);
    expect(s.notes[1].art?.orn).toEqual({ kind: 'trill', upper: 69, lower: 66 });
    expect(s.notes[2].art?.grace).toEqual([72]);
    expect(s.notes[2].art?.slurNext).toBe(true);
    expect(s.notes[3].art?.fermata).toBe(true);
    expect(neighbors(64, 0)).toEqual({ upper: 65, lower: 62 });
  });
  it('재생: 트릴은 번갈아, 꾸밈음은 앞당겨, 늘임표는 한 번만', () => {
    const p = planPlayback(s, { bpm: 60, from: 0, to: 2, countIn: false, expressive: true });
    const tr = expandOrnaments(p.events[1], 2);
    expect(tr.slice(0, 4).map((x) => x.midi)).toEqual([67, 69, 67, 69]);
    expect(tr[tr.length - 1].midi).toBe(67);
    const gr = expandOrnaments(p.events[2], 1.9);
    expect(gr[0]).toMatchObject({ midi: 72, main: false });
    expect(gr[0].time).toBeCloseTo(p.events[2].time - GRACE, 5);
    expect(gr[1]).toMatchObject({ midi: 71, main: true, legato: true });
    const plain = planPlayback(s, { bpm: 60, from: 0, to: 2, countIn: false });
    // 늘임표는 표현 재생에서만 늘어남 (expandOrnaments 는 늘이지 않음)
    expect(p.total).toBeGreaterThan(plain.total);
    expect(expandOrnaments(p.events[3], 4).length).toBe(1);
  });
  it('음 고치기용 parseTracked 도 표현·못갖춘마디를 그대로', () => {
    const t = parseTracked(XML);
    expect(t.els.length).toBe(t.notes.length);
    expect(t.measures[0]).toBe(0);
    expect(t.notes[1].art?.orn?.kind).toBe('trill');
    const x = editNote(XML, 2, 0, { kind: 'shift', semis: 1 });
    if ('error' in x) throw new Error(x.error);
    const e = parseMusicXML(x.xml);
    expect(e.notes[3].midi).toBe(70);
    expect(e.notes[3].art?.fermata).toBe(true);
    expect(e.notes[2].art?.slurNext).toBe(true);
    expect(e.measures).toEqual([0, 1, 2]);
  });
});

describe('지난 기록 다시 보기', () => {
  const s = parseMusicXML(doc([n('C', 5, 2, 'quarter'), n('D', 5, 2, 'quarter') + n('E', 5, 2, 'quarter') + n('F', 5, 4, 'half')]));
  const rs: Scored[] = [
    { note: s.notes[0], status: 'ok', cents: 14.4, playedMidi: 72, playedStart: 1.0, db: -30.04 },
    { note: s.notes[1], status: 'wrong', cents: null, playedMidi: 75, playedStart: 1.5, db: -28 },
    { note: s.notes[2], status: 'ok', cents: -12, playedMidi: 76, playedStart: 2.0, db: null },
    { note: s.notes[3], status: 'missed', cents: null, playedMidi: null },
  ];
  it('짧게 저장하고 되살리기', () => {
    const rn = toRunNotes(rs);
    expect(rn[0]).toEqual([0, 0, 72, 14, 0, -30, 0, null]);
    expect(rn[1]).toEqual([1, 0, 74, null, 1, -28, 0.5, 75]);
    const back = fromRunNotes(rn, s);
    expect(back.map((r) => r.status)).toEqual(['ok', 'wrong', 'ok', 'missed']);
    expect(back[1].playedMidi).toBe(75);
    expect(back[0].note).toBe(s.notes[0]);
  });
  it('음정 경향 (판정 기준 초록 한계)', () => {
    const ins = runInsight(toRunNotes(rs), 10.001);
    expect(ins).toMatchObject({ sharp: 1, flat: 1, inTune: 0, wrong: 1, missed: 1 });
    expect(runInsight(toRunNotes(rs), 15.001).inTune).toBe(2);
  });
  it('소리 크기 평균', () => {
    expect(meanDb([[0, -40], [0.1, -30], [0.2, -20], [0.3, -10]], 0.1, 0.2)).toBe(-25);
    expect(meanDb([], 0, 1)).toBeNull();
  });
});

describe('셈여림 비교', () => {
  const s = parseMusicXML(doc([
    dir('<dynamics><p/></dynamics>') + dir('<wedge type="crescendo"/>') + n('C', 5, 2, 'quarter'),
    n('D', 5, 2, 'quarter') + n('E', 5, 2, 'quarter') + n('F', 5, 2, 'quarter') + dir('<wedge type="stop"/>') + dir('<dynamics><f/></dynamics>') + n('G', 5, 2, 'quarter'),
  ]));
  const mk = (dbs: number[]): Scored[] => s.notes.map((note, i) => ({ note, status: 'ok', cents: 0, playedMidi: note.midi, db: dbs[i] }));
  it('크레셴도인데 소리가 그대로면 표시', () => {
    const flat = dynCompare(mk([-30, -30, -30, -30, -30]), s);
    expect(flat.hasDyn).toBe(true);
    expect(flat.flags[0]).toMatchObject({ kind: 'cresc' });
    const good = dynCompare(mk([-36, -32, -28, -24, -20]), s);
    expect(good.flags).toEqual([]);
    expect(good.points[0].expected).toBe(0);
    expect(good.points[4].expected).toBe(1);
  });
});
