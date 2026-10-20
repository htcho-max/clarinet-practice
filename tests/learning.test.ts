// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMusicXML, playOrder, hasRepeats, type ScoreNote } from '../src/score/parse';
import { planPlayback } from '../src/score/player';
import type { Scored } from '../src/score/align';
import { measureStats, reviewChanges, measureRuns, dueGroups, noteCentsOf, ladderVerdict, REVIEW_DAYS } from '../src/data/review';
import { habitMap, worstHabits, overallBias, habitTip, biasTip, weeklyTrends, mondayOf, gearStats } from '../src/data/insights';
import { analyzeBreak, breakAdvice, type BreakFrame } from '../src/audio/breakCross';
import { makePhrase, scoreEcho, nextLength, rng, ECHO_POOLS } from '../src/exercise/echo';
import type { ReviewItem, ToneRun } from '../src/data/db';

const note = (measure: number, midi: number, index = 0): ScoreNote => ({ measure, index, midi, beat: index, dur: 1 });
const ok = (m: number, c: number, midi = 60): Scored => ({ note: note(m, midi), status: 'ok', cents: c, playedMidi: midi });
const bad = (m: number, s: 'wrong' | 'missed' = 'wrong'): Scored => ({ note: note(m, 60), status: s, cents: null, playedMidi: s === 'wrong' ? 61 : null });

describe('복습함', () => {
  it('마디별 통계: 멈춘 뒤의 마디는 뺌', () => {
    const st = measureStats([ok(1, 5), ok(1, -30), bad(2), ok(2, 3), bad(3, 'missed'), bad(4, 'missed')]);
    expect(st.map((s) => s.measure)).toEqual([1, 2]);
    expect(st[0].meanAbs).toBeCloseTo(17.5);
    expect(st[1]).toMatchObject({ total: 2, ok: 1 });
  });
  it('틀린 마디는 넣고, 복습 날 깨끗하면 다음 칸, 마지막 칸이면 졸업', () => {
    const today = '2026-10-19';
    const c1 = reviewChanges(new Map(), measureStats([ok(1, 3), bad(2), ok(3, 40)]), 7, '곡', today);
    expect(c1.added).toEqual([2, 3]);
    expect(c1.put.every((p) => p.due === '2026-10-20' && p.box === 0)).toBe(true);
    const ex = new Map<string, ReviewItem>(c1.put.map((p) => [p.id, p]));
    // 같은 날 다시 깨끗하게 쳐도 그대로
    const same = reviewChanges(ex, measureStats([ok(2, 2), ok(3, 4)]), 7, '곡', today);
    expect(same.put).toEqual([]);
    // 다음 날 깨끗하게 → box 1, 간격 2일
    const next = reviewChanges(ex, measureStats([ok(2, 2), ok(3, 30)]), 7, '곡', '2026-10-20');
    expect(next.advanced).toEqual([2]);
    expect(next.put.find((p) => p.measure === 2)).toMatchObject({ box: 1, due: '2026-10-22' });
    expect(next.again).toEqual([3]);
    // 마지막 칸에서 통과 → 졸업
    const last = new Map<string, ReviewItem>([['7:2', { ...c1.put[0], box: REVIEW_DAYS.length - 1, due: '2026-10-19' }]]);
    const g = reviewChanges(last, measureStats([ok(2, 1)]), 7, '곡', today);
    expect(g.graduated).toEqual([2]);
    expect(g.del).toEqual(['7:2']);
  });
  it('판정 기준을 따름 (관대면 ±30까지 괜찮음, 엄격이면 ±10 넘으면 틀림)', () => {
    const st = measureStats([ok(1, 25), ok(1, 25)]);
    expect(reviewChanges(new Map(), st, 1, 't', '2026-10-19').added).toEqual([1]);
    expect(reviewChanges(new Map(), st, 1, 't', '2026-10-19', { good: 15, warn: 30 }).added).toEqual([]);
    expect(reviewChanges(new Map(), measureStats([ok(1, 12)]), 1, 't', '2026-10-19', { good: 5, warn: 10 }).added).toEqual([1]);
  });
  it('오늘 복습 묶음과 이어진 마디', () => {
    const it = (m: number, due: string, sid = 1): ReviewItem => ({ id: `${sid}:${m}`, scoreId: sid, measure: m, title: 't', box: 0, due, added: due });
    const g = dueGroups([it(5, '2026-10-19'), it(3, '2026-10-18'), it(9, '2026-10-25'), it(1, '2026-10-19', 2)], '2026-10-19');
    expect(g.map((x) => [x.scoreId, x.measures.map((m) => m.measure)])).toEqual([[1, [3, 5]], [2, [1]]]);
    expect(measureRuns([9, 3, 4, 5, 11, 10])).toEqual([[3, 5], [9, 11]]);
  });
  it('음별 음정 합계', () => {
    expect(noteCentsOf([ok(1, 10, 67), ok(1, 20, 67), ok(2, -5, 60), bad(2)])).toEqual([[67, 30, 2], [60, -5, 1]]);
  });
});

describe('템포 사다리', () => {
  it('90% 이상 + 목표 템포면 +4', () => {
    expect(ladderVerdict({ pct: 95, target: 60, bpm: 61, rhythmMeanAbs: 0.05 })).toMatchObject({ pass: true, next: 64 });
  });
  it('느리게 쳤으면 그대로, 70% 아래면 −4', () => {
    expect(ladderVerdict({ pct: 95, target: 80, bpm: 70, rhythmMeanAbs: 0.05 })).toMatchObject({ pass: false, next: 80 });
    expect(ladderVerdict({ pct: 60, target: 80, bpm: 80, rhythmMeanAbs: 0.05 })).toMatchObject({ pass: false, next: 76 });
    expect(ladderVerdict({ pct: 92, target: 80, bpm: null, rhythmMeanAbs: 0.2 }).pass).toBe(false);
  });
  it('음정 평균이 판정 기준의 노랑 한계 밖이면 통과 못 함', () => {
    expect(ladderVerdict({ pct: 95, target: 60, bpm: 60, rhythmMeanAbs: 0.05, meanAbs: 25 }).pass).toBe(false);
    expect(ladderVerdict({ pct: 95, target: 60, bpm: 60, rhythmMeanAbs: 0.05, meanAbs: 25, tol: { good: 15, warn: 30 } }).pass).toBe(true);
    expect(ladderVerdict({ pct: 95, target: 60, bpm: 60, rhythmMeanAbs: 0.05, meanAbs: 12, tol: { good: 5, warn: 10 } }).msg).toMatch(/±10 안이면/);
  });
});

describe('음정 습관', () => {
  const tone = (midi: number, meanCents: number, date = '2026-10-10'): ToneRun => ({ createdAt: 0, date, kind: 'long', midi, meanCents });
  it('채점 음과 롱톤(3음 무게)을 모아 평균', () => {
    const h = habitMap([{ date: '2026-10-10', noteCents: [[69, 60, 3], [60, -6, 2]] }, { date: '2026-01-01', noteCents: [[69, -500, 5]] }], [tone(69, 30), tone(60, 0, '2025-01-01')], '2026-09-19');
    expect(h).toEqual([{ midi: 60, mean: -3, n: 2 }, { midi: 69, mean: 25, n: 6 }]);
    expect(worstHabits(h).map((x) => x.midi)).toEqual([69]);
    expect(overallBias(h)).toBeNull(); // 음이 적으면 전체 경향은 말하지 않음
  });
  it('고치는 법: 스로트 음이 높으면 레조넌스 운지, 전체가 높으면 배럴', () => {
    expect(habitTip('clarinet', 69, 20)).toMatch(/레조넌스/);
    expect(habitTip('flute', 60, -20)).toMatch(/위로/);
    expect(biasTip('clarinet', 12)).toMatch(/배럴을 조금 빼/);
    expect(biasTip('flute', -10)).toMatch(/헤드조인트를 조금 넣/);
    expect(biasTip('clarinet', 3)).toBeNull();
  });
});

describe('주별 추이', () => {
  it('월요일 시작 주로 묶음', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // 월
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // 일
    const rows = weeklyTrends(
      [{ date: '2026-10-19', totalSec: 600 }, { date: '2026-10-13', totalSec: 1200 }],
      [{ date: '2026-10-19', ok: 9, total: 10, durationSec: 60, inSession: false }],
      [
        { createdAt: 0, date: '2026-10-13', kind: 'long', durationSec: 9, centsSD: 4 },
        { createdAt: 0, date: '2026-10-14', kind: 'long', durationSec: 12, centsSD: 6 },
        { createdAt: 0, date: '2026-10-19', kind: 'tongue', bpm: 80, hits: 15, expected: 16 },
        { createdAt: 0, date: '2026-10-19', kind: 'tongue', bpm: 96, hits: 8, expected: 16 },
        { createdAt: 0, date: '2026-10-19', kind: 'break', hits: 10, clean: 7 },
        { createdAt: 0, date: '2026-10-19', kind: 'echo', hits: 3, expected: 4 },
      ],
      '2026-10-20', 3);
    expect(rows.map((r) => r.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(rows[1]).toMatchObject({ minutes: 20, longBest: 12, longSD: 5 });
    expect(rows[2]).toMatchObject({ minutes: 11, tongueBpm: 80, scorePct: 90, breakClean: 70, echoPct: 75 });
    expect(rows[0].longBest).toBeNull();
  });
  it('리드별 집계', () => {
    const s = gearStats([{ id: 1, label: '#1', createdAt: 0 }, { id: 2, label: '#2', createdAt: 0 }],
      [{ createdAt: 0, date: '2026-10-10', kind: 'long', durationSec: 10, centsSD: 4, gearId: 1 }, { createdAt: 0, date: '2026-10-12', kind: 'long', durationSec: 14, centsSD: 8, gearId: 1 }],
      [{ date: '2026-10-15', gearId: 1, ok: 8, total: 10 }]);
    expect(s[0]).toMatchObject({ uses: 3, last: '2026-10-15', longSD: 6, longBest: 14, scorePct: 80 });
    expect(s[1]).toMatchObject({ uses: 0, last: null });
  });
});

describe('브레이크 넘기 분석', () => {
  /** [음(또는 null), 초] 구간들을 10ms 프레임으로 */
  const frames = (parts: [number | null, number][]): BreakFrame[] => {
    const out: BreakFrame[] = []; let t = 0;
    for (const [m, d] of parts) for (let k = 0; k < Math.round(d / 0.01); k++) { out.push({ t, m }); t += 0.01; }
    return out;
  };
  it('끊김 시간과 방향', () => {
    const r = analyzeBreak(frames([[69, 0.5], [null, 0.05], [71.1, 0.5], [null, 0.2], [69, 0.5]]), 69, 71);
    expect(r.crossings.map((c) => c.dir)).toEqual(['up', 'down']);
    expect(r.up.meanGapMs).toBeGreaterThanOrEqual(50);
    expect(r.up.meanGapMs).toBeLessThanOrEqual(70);
    expect(r.down.meanGapMs).toBeGreaterThan(180);
    expect(r.clean).toBe(1);
  });
  it('끽 소리(훨씬 높은 음)와 엉뚱한 음', () => {
    const r = analyzeBreak(frames([[69, 0.4], [86, 0.04], [71, 0.4], [64, 0.1], [69, 0.4]]), 69, 71);
    expect(r.crossings[0].squeak).toBe(true);
    expect(r.crossings[1].stray).toBe(true);
    expect(r.squeaks).toBe(1);
    expect(r.clean).toBe(0);
    expect(breakAdvice(r, 'clarinet')[0]).toMatch(/끽 소리/);
  });
  it('아주 짧은 튐은 같은 음으로, 길게 쉬면 넘기로 안 침', () => {
    const r = analyzeBreak(frames([[69, 0.3], [null, 0.02], [69, 0.3], [71, 0.3], [null, 1.5], [69, 0.3]]), 69, 71);
    expect(r.crossings.length).toBe(1);
    expect(r.crossings[0].gapMs).toBeLessThan(20);
    expect(analyzeBreak([], 69, 71).score).toBe(0);
  });
});

describe('듣고 따라 불기', () => {
  it('악구: 묶음 안의 음, 같은 음 연달아 없음, 같은 씨앗이면 같음', () => {
    const pool = ECHO_POOLS.clarinet[1].notes;
    const a = makePhrase(pool, 5, rng(3)), b = makePhrase(pool, 5, rng(3));
    expect(a).toEqual(b);
    expect(a.length).toBe(5);
    expect(a.every((m) => pool.includes(m))).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    for (let s = 1; s < 50; s++) { const p = makePhrase(ECHO_POOLS.flute[0].notes, 4, rng(s)); expect(p.length).toBe(4); }
  });
  it('채점: 같은 음 이어짐은 하나로, 앞의 잡음 건너뜀', () => {
    expect(scoreEcho([60, 62, 64], [60, 60, 62, 64])).toMatchObject({ correct: 3, perfect: true });
    expect(scoreEcho([60, 62, 64], [55, 60, 62, 64]).perfect).toBe(true);
    expect(scoreEcho([60, 62, 64], [60, 63]).marks).toEqual(['ok', 'wrong', 'missing']);
  });
  it('길이 조절', () => {
    expect(nextLength(3, [true, true, true], 0)).toBe(4);
    expect(nextLength(6, [true, true, true], 0)).toBe(6);
    expect(nextLength(3, [true, false], 2)).toBe(2);
    expect(nextLength(2, [], 2)).toBe(2);
  });
});

describe('도돌이표 펼치기', () => {
  const m = (num: number, bar = '', extra = '') => `<measure number="${num}">${num === 1 ? '<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>' : ''}${bar}<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>${extra}</measure>`;
  const doc = (ms: string) => `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>M</part-name></score-part></part-list><part id="P1">${ms}</part></score-partwise>`;
  const fwd = '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>';
  const back = (times = '') => `<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"${times}/></barline>`;
  it('도돌이표 없으면 그대로', () => {
    const s = parseMusicXML(doc(m(1) + m(2)));
    expect(hasRepeats(s)).toBe(false);
    expect(playOrder(s)).toEqual([1, 2]);
  });
  it('처음부터 반복, 중간부터 반복, 세 번 반복', () => {
    expect(playOrder(parseMusicXML(doc(m(1) + m(2, '', back()) + m(3))))).toEqual([1, 2, 1, 2, 3]);
    expect(playOrder(parseMusicXML(doc(m(1) + m(2, fwd) + m(3, '', back()) + m(4))))).toEqual([1, 2, 3, 2, 3, 4]);
    expect(playOrder(parseMusicXML(doc(m(1, fwd) + m(2, '', back(' times="3"')))))).toEqual([1, 2, 1, 2, 1, 2]);
  });
  it('1·2번 괄호', () => {
    const e1 = '<barline location="left"><ending number="1" type="start"/></barline>';
    const e1end = '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>';
    const e2 = '<barline location="left"><ending number="2" type="start"/></barline>';
    const e2end = '<barline location="right"><ending number="2" type="discontinue"/></barline>';
    const s = parseMusicXML(doc(m(1, fwd) + m(2) + m(3, e1) + m(4, '', e1end) + m(5, e2, e2end) + m(6)));
    expect(s.bars.find((b) => b.num === 4)?.ending).toEqual([1]);
    expect(playOrder(s)).toEqual([1, 2, 3, 4, 1, 2, 5, 6]);
  });
  it('재생 계획: 펼친 순서로, 시간이 이어짐', () => {
    const s = parseMusicXML(doc(m(1) + m(2, '', back()) + m(3)));
    const p = planPlayback(s, { bpm: 60, from: 1, to: 3, countIn: false, order: playOrder(s) });
    expect(p.events.map((e) => e.note.measure)).toEqual([1, 2, 1, 2, 3]);
    expect(p.events.map((e) => e.time)).toEqual([0, 2, 4, 6, 8]);
    expect(p.total).toBe(10);
    const q = planPlayback(s, { bpm: 60, from: 2, to: 3, countIn: false, order: playOrder(s) });
    expect(q.events.map((e) => e.note.measure)).toEqual([2, 2, 3]);
  });
});
