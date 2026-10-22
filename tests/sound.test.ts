// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { layerFor, pickSample, type SampleRow } from '../src/audio/sampler';
import clar from '../src/audio/clarinetSamples.json';
import flute from '../src/audio/fluteSamples.json';
import { parseMusicXML } from '../src/score/parse';
import { planPlayback } from '../src/score/player';

const rows = clar.layers as unknown as Record<string, SampleRow[]>;
describe('녹음 샘플 고르기', () => {
  it('셈여림 → 층', () => {
    expect(layerFor(0.33, 'clarinet')).toBe('p');
    expect(layerFor(0.7, 'clarinet')).toBe('mf');
    expect(layerFor(0.97, 'clarinet')).toBe('f');
    expect(layerFor(0.33, 'flute', true)).toBe('vib');
    expect(layerFor(0.33, 'flute', false)).toBe('p');
    expect(layerFor(0.85, 'flute', false)).toBe('f');
  });
  it('매니페스트: 층마다 전 음역, 음정 오차 작음', () => {
    for (const m of [clar, flute]) for (const [, list] of Object.entries(m.layers as unknown as Record<string, SampleRow[]>)) {
      expect(list.length).toBeGreaterThanOrEqual(10);
      for (const r of list) { expect(Math.abs(r[2])).toBeLessThan(15); expect(r[3]).toBeGreaterThan(0); }
      for (let i = 1; i < list.length; i++) expect(list[i][1] - list[i - 1][1]).toBeLessThanOrEqual(5);
    }
  });
  it('가장 가까운 샘플·재생 속도 (음정 오차·A4 보정), 층이 없으면 기본 층', () => {
    const all = () => true;
    const a = pickSample(62, 440, 'mf', rows, all)!;
    expect(a.row[0]).toBe('mf-62');
    expect(a.rate).toBeCloseTo(Math.pow(2, (0.7 / 100) / 12), 4); // mf-62 은 -0.7센트
    const b = pickSample(63, 442, 'f', rows, all)!;
    expect(b.row[0]).toBe('f-62');
    expect(b.rate).toBeCloseTo(Math.pow(2, (1 + 0.007 + 12 * Math.log2(442 / 440)) / 12), 3);
    const c = pickSample(70, 440, 'p', rows, (n) => n.startsWith('mf'))!;
    expect(c.layer).toBe('mf');
    expect(pickSample(70, 440, 'p', rows, () => false)).toBeNull();
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
