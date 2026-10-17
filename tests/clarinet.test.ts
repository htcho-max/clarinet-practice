import { describe, it, expect } from 'vitest';
import { FINGERINGS, fingeringFor, crossesBreak, keyChanges } from '../src/clarinet/fingerings';
import { ALL_KEYS } from '../src/components/FingeringDiagram';
import { LongToneTracker, analyzeTone, slope, toneAdvice, type TonePoint } from '../src/audio/longtone';
import { findOnsets, scoreTonguing, tongueAdvice, type EnvPoint } from '../src/audio/tonguing';
import { midiToFreq } from '../src/audio/notes';
import { spell } from '../src/components/MiniStaff';

describe('운지표', () => {
  it('E3~G6 반음마다 하나씩, 빠짐없이', () => {
    const ms = FINGERINGS.map((f) => f.midi);
    expect(ms[0]).toBe(52);
    for (let i = 1; i < ms.length; i++) expect(ms[i]).toBe(ms[i - 1] + 1);
    expect(ms[ms.length - 1]).toBe(91);
  });
  it('클라리온 = 샬뤼모 운지 + 레지스터 키 (B4~C6)', () => {
    for (let m = 71; m <= 84; m++) {
      const low = fingeringFor(m - 19)!.main.keys;
      const hi = fingeringFor(m)!.main.keys;
      expect(hi).toContain('reg');
      expect(hi.filter((k) => k !== 'reg').sort()).toEqual([...low].sort());
    }
  });
  it('알려진 운지', () => {
    expect(fingeringFor(67)!.main.keys).toEqual([]); // 열린 G
    expect(fingeringFor(65)!.main.keys).toEqual(['thumb']); // F4
    expect(fingeringFor(69)!.main.keys).toEqual(['a']);
    expect(fingeringFor(70)!.main.keys.sort()).toEqual(['a', 'reg']);
    expect(fingeringFor(55)!.main.keys.length).toBe(7); // G3 모두 막기
    expect(fingeringFor(84)!.main.keys.sort()).toEqual(['reg', 'thumb']); // C6
  });
  it('그림에 모든 키가 있음', () => {
    const all = new Set(ALL_KEYS);
    for (const f of FINGERINGS) for (const fg of [f.main, ...f.alts]) for (const k of fg.keys) expect(all.has(k)).toBe(true);
  });
  it('브레이크·움직이는 키 수', () => {
    expect(crossesBreak(69, 71)).toBe(true);
    expect(crossesBreak(67, 69)).toBe(false);
    expect(keyChanges(69, 71)).toBeGreaterThan(8); // A4 → B4 는 거의 모든 손가락
    expect(keyChanges(60, 62)).toBe(1);
  });
  it('오선 철자', () => {
    expect(spell(70)).toEqual({ letter: 'B', alter: -1, octave: 4 });
    expect(spell(66)).toEqual({ letter: 'F', alter: 1, octave: 4 });
    expect(spell(52)).toEqual({ letter: 'E', alter: 0, octave: 3 });
  });
});

describe('롱톤', () => {
  const make = (sec: number, f: (t: number) => { cents: number; db: number }): TonePoint[] =>
    Array.from({ length: Math.round(sec * 60) }, (_, i) => { const t = i / 60; const v = f(t); return { t, cents: v.cents, db: v.db }; });
  it('기울기', () => expect(slope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2, 9));
  it('고른 롱톤: 흔들림 작음', () => {
    const r = analyzeTone(make(6, (t) => ({ cents: 3 + Math.sin(t * 20), db: -20 + 0.3 * Math.sin(t * 7) })), 67)!;
    expect(r.durationSec).toBeCloseTo(6, 1);
    expect(r.meanCents).toBeCloseTo(3, 0);
    expect(r.centsSD).toBeLessThan(1);
    expect(r.dbSD).toBeLessThan(0.5);
    expect(toneAdvice(r, 'steady')[0]).toContain('아주 고르게');
  });
  it('끝으로 처짐 → 조언', () => {
    const r = analyzeTone(make(8, (t) => ({ cents: 5 - 3 * t, db: -20 })), 60)!;
    expect(r.driftPerSec).toBeCloseTo(-3, 1);
    expect(toneAdvice(r, 'steady').join(' ')).toContain('처져요');
  });
  it('크게 불수록 음이 올라감 (센트/dB)', () => {
    const r = analyzeTone(make(8, (t) => { const db = -35 + 20 * Math.sin((Math.PI * t) / 8); return { cents: (db + 25) * 1.5, db }; }), 60)!;
    expect(r.dbRange).toBeGreaterThan(15);
    expect(r.centsPerDb!).toBeCloseTo(1.5, 1);
    expect(toneAdvice(r, 'swell').join(' ')).toContain('올라가요');
  });
  it('추적기: 음이 이어지다 끊기면 결과', () => {
    const tr = new LongToneTracker(440);
    const f = midiToFreq(67) * Math.pow(2, 4 / 1200); // +4센트
    let res = null;
    for (let i = 0; i < 300; i++) res = tr.push(i / 60, f, -20) ?? res;
    expect(res).toBeNull();
    expect(tr.elapsed).toBeCloseTo(299 / 60, 3);
    for (let i = 300; i < 330; i++) res = tr.push(i / 60, null, -80) ?? res;
    expect(res!.midi).toBe(67);
    expect(res!.meanCents).toBeCloseTo(4, 1);
  });
  it('짧으면 롱톤 아님', () => {
    expect(analyzeTone(make(0.5, () => ({ cents: 0, db: -20 })), 60)).toBeNull();
  });
});

describe('텅잉', () => {
  /** 5ms 간격 소리 크기: 어택마다 20ms 동안 -60dB 로 끊겼다가 -20dB */
  function env(onsets: number[], len: number, click?: number[]): EnvPoint[] {
    const out: EnvPoint[] = [];
    for (let t = 0; t < len; t += 0.005) {
      let db = -80;
      const last = onsets.filter((o) => o <= t).pop();
      if (last !== undefined) db = t - last < 0.002 ? -60 : -20;
      const next = onsets.find((o) => o > t);
      if (next !== undefined && next - t < 0.02 && last !== undefined) db = -60; // 혀로 끊김
      if (click?.some((c) => t >= c && t - c < 0.015)) db = Math.max(db, -25); // 짧은 클릭
      out.push({ t, db });
    }
    return out;
  }
  it('어택 찾기', () => {
    const ons = [0.5, 1.0, 1.5, 2.0, 2.5];
    const found = findOnsets(env(ons, 3.2), { floorDb: -50 });
    expect(found.length).toBe(5);
    found.forEach((f, i) => expect(Math.abs(f - ons[i])).toBeLessThan(0.012));
  });
  it('짧은 클릭(소리가 안 이어짐)은 어택이 아님', () => {
    const found = findOnsets(env([1.0], 2.0, [0.25, 0.5]), { floorDb: -50 });
    expect(found.length).toBe(1);
  });
  it('박과 맞추기: 늦은 어택, 빠진 음', () => {
    // ♩=60, 8분음표 → 0.5초 간격, 8음. 모두 30ms 늦고 6번째는 빠짐
    const ons = [0, 0.5, 1, 1.5, 2, 3, 3.5].map((t) => 10 + t + 0.03);
    const r = scoreTonguing(ons, 10, 60, 2, 8);
    expect(r.hits).toBe(7);
    expect(r.missed).toBe(1);
    expect(r.meanMs!).toBeCloseTo(30, 5);
    expect(r.evenPct!).toBeLessThan(1);
    expect(r.grid[5].hit).toBeNull();
    expect(tongueAdvice(r).join(' ')).toContain('늦어요');
  });
  it('점점 빨라짐', () => {
    const ons = Array.from({ length: 8 }, (_, k) => k * 0.5 * (1 - k * 0.015));
    const r = scoreTonguing(ons, 0, 60, 2, 8);
    expect(r.actualBpm!).toBeGreaterThan(60);
  });
});

describe('롱톤: 소리 크기에 -Infinity 가 섞여도', () => {
  it('NaN 이 안 나옴', () => {
    const pts = Array.from({ length: 300 }, (_, i) => ({ t: i / 60, cents: 2, db: i % 50 === 0 ? -Infinity : -20 - i / 30 }));
    const r = analyzeTone(pts, 67)!;
    expect(Number.isFinite(r.dbSD)).toBe(true);
    expect(Number.isFinite(r.dbMean)).toBe(true);
    expect(Number.isFinite(r.dbRange)).toBe(true);
  });
});

import { FLUTE_FINGERINGS } from '../src/flute/fingerings';
import { FLUTE_DIAGRAM_KEYS } from '../src/components/FluteDiagram';
import { FLUTE, CLARINET } from '../src/instruments/profiles';
describe('플룻 운지표 (YFL-222)', () => {
  it('C4~C7 반음마다 하나씩', () => {
    const ms = FLUTE_FINGERINGS.map((f) => f.midi);
    expect(ms[0]).toBe(60);
    for (let i = 1; i < ms.length; i++) expect(ms[i]).toBe(ms[i - 1] + 1);
    expect(ms[ms.length - 1]).toBe(96);
  });
  it('2옥타브 E5~C♯6 은 1옥타브와 같은 운지', () => {
    for (let m = 76; m <= 85; m++) expect(FLUTE_FINGERINGS.find((x) => x.midi === m)!.main.keys).toEqual(FLUTE_FINGERINGS.find((x) => x.midi === m - 12)!.main.keys);
  });
  it('알려진 운지', () => {
    const k = (m: number) => [...FLUTE_FINGERINGS.find((x) => x.midi === m)!.main.keys].sort();
    expect(k(71)).toEqual(['eb', 'l1', 'thumbB']); // B4
    expect(k(72)).toEqual(['eb', 'l1']); // C5
    expect(k(73)).toEqual(['eb']); // C♯5
    expect(k(62)).toEqual(['l1', 'l2', 'l3', 'r1', 'r2', 'r3', 'thumbB']); // D4: E♭ 키 뗌
    expect(k(74)).not.toContain('l1'); // D5: 왼손 검지 뗌
    expect(k(60)).toContain('c'); // C 풋
  });
  it('그림에 모든 키가 있음', () => {
    const all = new Set(FLUTE_DIAGRAM_KEYS);
    for (const f of FLUTE_FINGERINGS) for (const fg of [f.main, ...f.alts]) for (const key of fg.keys) expect(all.has(key)).toBe(true);
  });
  it('프로필: 이조 없음, 음역, 감지 범위', () => {
    expect(FLUTE.transposeChoices).toEqual(['C']);
    expect(FLUTE.maxFreq).toBeGreaterThan(2093); // C7
    expect(CLARINET.minFreq).toBeLessThan(147); // 실음 D3
    for (const p of [FLUTE, CLARINET]) for (const r of p.fgRanges) expect(p.fingerings.some((f) => f.midi === r.lo) && p.fingerings.some((f) => f.midi === r.hi)).toBe(true);
    for (const p of [FLUTE, CLARINET]) for (const m of [...p.longNotes, ...p.tuneNotes.map((t) => t.midi)]) expect(p.fingerings.some((f) => f.midi === m)).toBe(true);
  });
});
