// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXML } from '../src/score/parse';
import { planPlayback, expressNotes, DYN_LEVEL } from '../src/score/player';

const n = (step: string, oct: number, dur: number, type: string, extra = '', notations = '') =>
  `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration>${extra}<voice>1</voice><type>${type}</type>${notations ? `<notations>${notations}</notations>` : ''}</note>`;
const dir = (inner: string) => `<direction><direction-type>${inner}</direction-type></direction>`;
const score = (measures: string[]) => `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>M</part-name></score-part></part-list><part id="P1">${measures.map((m, i) => `<measure number="${i + 1}">${i === 0 ? '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' : ''}${m}</measure>`).join('')}</part></score-partwise>`;

const XML = score([
  // 1마디: p, 이음줄 C D E F (8분 4개) + 스타카토 G A (4분 2개)
  dir('<dynamics><p/></dynamics>') +
  n('C', 5, 1, 'eighth', '', '<slur type="start" number="1"/>') + n('D', 5, 1, 'eighth') + n('E', 5, 1, 'eighth') + n('F', 5, 1, 'eighth', '', '<slur type="stop" number="1"/>') +
  n('G', 5, 2, 'quarter', '', '<articulations><staccato/></articulations>') + n('A', 5, 2, 'quarter', '', '<articulations><staccato/></articulations>'),
  // 2마디: 크레셴도 → f, 강세
  dir('<wedge type="crescendo"/>') + n('C', 5, 2, 'quarter') + n('D', 5, 2, 'quarter') + dir('<wedge type="stop"/>') +
  dir('<dynamics><f/></dynamics>') + n('E', 5, 2, 'quarter', '', '<articulations><accent/></articulations>') + n('F', 5, 2, 'quarter'),
  // 3마디: rit. 그리고 늘임표 (온음표)
  dir('<words>rit.</words>') + n('G', 5, 8, 'whole', '', '<fermata/>'),
]);

describe('악보 표현 읽기', () => {
  const s = parseMusicXML(XML);
  it('이음줄·스타카토·셈여림·쐐기·rit.·늘임표', () => {
    const a = s.notes.map((x) => x.art ?? {});
    expect(a.slice(0, 4).map((x) => !!x.slurNext)).toEqual([true, true, true, false]);
    expect(a[4].stacc && a[5].stacc).toBe(true);
    expect(a[0].dyn).toBe('p');
    expect(a[6].wedge).toBe('cresc');
    expect(a[8].wedge).toBe('stop');
    expect(a[8].dyn).toBe('f');
    expect(a[8].accent).toBe(true);
    expect(a[10].tempo).toBe('rit');
    expect(a[10].fermata).toBe(true);
  });
  it('셈여림: p → 크레셴도 → f', () => {
    const ex = expressNotes(s);
    expect(ex[0].gain).toBeCloseTo(DYN_LEVEL.p, 5);
    expect(ex[7].gain).toBeGreaterThan(DYN_LEVEL.p);
    expect(ex[7].gain).toBeLessThan(DYN_LEVEL.f);
    expect(ex[8].gain).toBeCloseTo(DYN_LEVEL.f, 5);
    expect(ex[8].accent).toBe(true);
  });
  it('재생 계획: 이음줄은 이어서, 스타카토는 짧게, 늘임표·rit. 은 길게', () => {
    const plain = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false });
    const p = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false, expressive: true });
    const e = p.events;
    expect(e[0].len!).toBeGreaterThan(e[0].dur); // 이음줄: 다음 음과 겹침
    expect(e[1].legatoIn && e[2].legatoIn && e[3].legatoIn).toBe(true);
    expect(e[4].legatoIn).toBeFalsy(); // 이음줄 끝 다음 음은 혀로
    expect(e[3].len!).toBeLessThan(e[3].dur); // 이음줄 끝 음은 살짝 끊음
    expect(e[4].len!).toBeLessThanOrEqual(e[4].dur * 0.45 + 1e-9); // 스타카토
    expect(plain.events[10].time).toBeCloseTo(8, 5); // 표현 없음: 그대로
    expect(e[10].time).toBeCloseTo(8, 5); // rit. 은 그 음부터
    expect(e[10].dur).toBeGreaterThan(4 + 2); // rit.(느려짐) + 늘임표
    expect(p.total).toBeGreaterThan(plain.total + 2);
  });
});

describe('쐐기가 이어질 때', () => {
  it('dim. 끝 크기에서 다음 디미누엔도가 시작 (갑자기 커지지 않음)', () => {
    const XML2 = score([
      dir('<dynamics><f/></dynamics>') + dir('<words>dim.</words>') + n('C', 5, 2, 'quarter') + n('D', 5, 2, 'quarter') + n('E', 5, 2, 'quarter') + n('F', 5, 2, 'quarter'),
      dir('<wedge type="diminuendo"/>') + n('G', 5, 2, 'quarter') + n('A', 5, 2, 'quarter') + dir('<wedge type="stop"/>') + dir('<dynamics><pp/></dynamics>') + n('B', 5, 4, 'half'),
    ]);
    const ex = expressNotes(parseMusicXML(XML2));
    for (let i = 1; i < ex.length; i++) expect(ex[i].gain).toBeLessThanOrEqual(ex[i - 1].gain + 1e-9);
    expect(ex[6].gain).toBeCloseTo(DYN_LEVEL.pp, 5);
  });
});
