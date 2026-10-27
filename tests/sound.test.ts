// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { layerFor, pickSample } from '../src/audio/sampler';
import { SOUND_SETS, soundSetFor } from '../src/audio/soundSets';
import { parseMusicXML } from '../src/score/parse';
import { planPlayback } from '../src/score/player';

const C = SOUND_SETS.clarinet, F = SOUND_SETS.flute;
const vsco = soundSetFor('clarinet', 'vsco');
describe('녹음 샘플 고르기', () => {
  it('셈여림 → 층', () => {
    expect(layerFor(0.33, vsco)).toBe('p');
    expect(layerFor(0.7, vsco)).toBe('mf');
    expect(layerFor(0.97, vsco)).toBe('f');
    expect(layerFor(0.33, soundSetFor('flute', 'vsco'))).toBe('vib');
    expect(layerFor(0.33, soundSetFor('flute', 'vsco-nv'))).toBe('p');
    expect(layerFor(0.85, soundSetFor('flute', 'vsco-nv'))).toBe('f');
    expect(layerFor(0.3, soundSetFor('flute', 'musyng'))).toBe('main');
  });
  it('소리 목록: 첫 번째가 기본, 모르는 id 면 기본', () => {
    expect(C.map((x) => x.id)).toEqual(['vsco', 'musyng', 'fatboy', 'fluid']);
    expect(F.map((x) => x.id)).toEqual(['vsco', 'vsco-nv', 'musyng', 'fatboy', 'fluid']);
    expect(soundSetFor('clarinet', 'nope').id).toBe('vsco');
  });
  it('모든 소리: 층마다 전 음역, 음정 오차 작음, 간격 5반음 이하', () => {
    for (const set of [...C, ...F]) for (const [, list] of Object.entries(set.layers)) {
      expect(list.length).toBeGreaterThanOrEqual(10);
      for (const r of list) { expect(Math.abs(r[2])).toBeLessThan(25); expect(r[3]).toBeGreaterThan(0); }
      for (let i = 1; i < list.length; i++) expect(list[i][1] - list[i - 1][1]).toBeLessThanOrEqual(5);
      const lo = list[0][1], hi = list[list.length - 1][1];
      expect(lo).toBeLessThanOrEqual(set.dir.startsWith('clarinet') ? 50 : 60);
      expect(hi).toBeGreaterThanOrEqual(set.dir.startsWith('clarinet') ? 89 : 93);
    }
  });
  it('가장 가까운 샘플·재생 속도 (음정 오차·A4 보정), 층이 없으면 기본 층', () => {
    const all = () => true;
    const a = pickSample(62, 440, 'mf', vsco, all)!;
    expect(a.row[0]).toBe('mf-62');
    expect(a.rate).toBeCloseTo(Math.pow(2, (0.7 / 100) / 12), 4); // mf-62 은 -0.7센트
    const b = pickSample(63, 442, 'f', vsco, all)!;
    expect(b.row[0]).toBe('f-62');
    expect(b.rate).toBeCloseTo(Math.pow(2, (1 + 0.007 + 12 * Math.log2(442 / 440)) / 12), 3);
    const c = pickSample(70, 440, 'p', vsco, (n) => n.startsWith('mf'))!;
    expect(c.layer).toBe('mf');
    expect(pickSample(70, 440, 'p', vsco, () => false)).toBeNull();
    const m = pickSample(71, 440, undefined, soundSetFor('clarinet', 'fluid'), all)!;
    expect([70, 72]).toContain(m.row[1]);
  });
});

describe('크레셴도: 음 안에서도 다음 음 크기로', () => {
  const n = (step: string, dur: number) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`;
  const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>M</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <direction><direction-type><dynamics><p/></dynamics></direction-type></direction><direction><direction-type><wedge type="crescendo"/></direction-type></direction>${n('C', 1)}${n('D', 1)}${n('E', 1)}<direction><direction-type><wedge type="stop"/></direction-type></direction><direction><direction-type><dynamics><f/></dynamics></direction-type></direction>${n('F', 1)}</measure>
    <measure number="2">${n('G', 4)}</measure></part></score-partwise>`;
  it('gainEnd', () => {
    const e = planPlayback(parseMusicXML(xml), { bpm: 60, from: 1, to: 2, countIn: false, expressive: true }).events;
    expect(e[0].gainEnd).toBeGreaterThan(e[0].gain!);
    expect(e[1].gainEnd).toBeGreaterThan(e[1].gain!);
    expect(e[4].gainEnd).toBeUndefined();
  });
});
