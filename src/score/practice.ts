/** 채점 기록을 다시 보기·분석하는 계산들 (화면 없이 순수 함수): 음마다 기록, 지난 기록 되살리기, 음정 경향, 셈여림 비교 */
import type { Scored } from './align';
import type { ParsedScore, ScoreNote } from './parse';
import { expressNotes } from './player';

/** 채점 결과 한 음 (기록용으로 짧게): [마디, 순서, midi, 센트(정수)|null, 0 맞음·1 다른 음·2 놓침, 소리 크기 dB|null,
 *  연주 시작 시각(초, 첫 음 기준)|null, 다른 음이면 실제로 낸 midi|null] */
export type RunNote = [number, number, number, number | null, 0 | 1 | 2, number | null, (number | null)?, (number | null)?];
export const RUN_NOTES_MAX = 600;

export function toRunNotes(rs: Scored[]): RunNote[] {
  const t0 = rs.find((r) => r.playedStart != null)?.playedStart ?? null;
  return rs.slice(0, RUN_NOTES_MAX).map((r) => [
    r.note.measure, r.note.index, r.note.midi,
    r.status === 'ok' && r.cents !== null ? Math.round(r.cents) : null,
    r.status === 'ok' ? 0 : r.status === 'wrong' ? 1 : 2,
    r.db === undefined || r.db === null || !Number.isFinite(r.db) ? null : Math.round(r.db * 10) / 10,
    r.playedStart != null && t0 !== null ? Math.round((r.playedStart - t0) * 1000) / 1000 : null,
    r.status === 'wrong' ? r.playedMidi : null,
  ]);
}

/** 저장된 기록을 채점 결과 모양으로 되살리기 (악보 색칠·박자·셈여림 보기에 그대로 씀).
 *  악보를 고쳐서 음이 바뀌었으면 기록의 음 높이를 씀 */
export function fromRunNotes(notes: RunNote[], parsed: ParsedScore): Scored[] {
  const byKey = new Map<string, ScoreNote>(parsed.notes.map((n) => [`${n.measure}:${n.index}`, n]));
  return notes.map(([m, i, midi, cents, st, db, start, played]) => {
    const note = byKey.get(`${m}:${i}`) ?? { measure: m, index: i, midi, beat: 0, dur: 0 };
    return {
      note: note.midi === midi ? note : { ...note, midi },
      status: st === 0 ? 'ok' : st === 1 ? 'wrong' : 'missed',
      cents: st === 0 ? cents : null,
      playedMidi: st === 0 ? midi : st === 1 ? (played ?? null) : null,
      playedStart: start ?? null,
      db,
    } as Scored;
  });
}

/** 기록 한 번의 음정 경향: 높게·낮게 낸 음 수, 가장 벗어난 음. threshold = 초록 한계(센트) */
export interface RunInsight { sharp: number; flat: number; inTune: number; wrong: number; missed: number; worst: { measure: number; midi: number; cents: number }[] }
export function runInsight(notes: RunNote[], threshold = 10): RunInsight {
  let sharp = 0, flat = 0, inTune = 0, wrong = 0, missed = 0;
  const offs: { measure: number; midi: number; cents: number }[] = [];
  for (const [m, , midi, cents, st] of notes) {
    if (st === 1) { wrong++; continue; }
    if (st === 2) { missed++; continue; }
    if (cents === null) continue;
    if (cents >= threshold) sharp++; else if (cents <= -threshold) flat++; else inTune++;
    offs.push({ measure: m, midi, cents });
  }
  offs.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
  return { sharp, flat, inTune, wrong, missed, worst: offs.filter((o) => Math.abs(o.cents) >= threshold).slice(0, 3) };
}

// ── 셈여림 비교 ──
export interface DynPoint { i: number; measure: number; expected: number; actual: number | null }
export interface DynFlag { kind: 'cresc' | 'dim'; fromMeasure: number; toMeasure: number; expectedDelta: number; actualDb: number }
/** 악보 셈여림(재생과 같은 expressNotes 세기)과 실제 소리 크기(dB)를 음 순서대로 0~1 로 맞춰 비교.
 *  flags = 점점 세게·여리게인데 소리에 안 드러난 곳 (2dB 미만) */
export function dynCompare(rs: Scored[], parsed: ParsedScore): { points: DynPoint[]; flags: DynFlag[]; hasDyn: boolean } {
  const ex = expressNotes(parsed);
  const gain = new Map(parsed.notes.map((n, i) => [`${n.measure}:${n.index}`, ex[i]?.gain ?? 0.7]));
  const hasDyn = parsed.notes.some((n) => n.art?.dyn !== undefined || n.art?.wedge !== undefined);
  const notes = rs.map((r) => r.note);
  const exp = notes.map((n) => gain.get(`${n.measure}:${n.index}`) ?? 0.7);
  const db = rs.map((r) => (r.status === 'ok' && r.db !== undefined && r.db !== null && Number.isFinite(r.db) ? r.db : null));
  // 3음 이동 평균 (빈 값은 건너뜀)
  const sm = db.map((_, i) => {
    const w = [db[i - 1], db[i], db[i + 1]].filter((x): x is number => x !== null && x !== undefined);
    return db[i] === null ? null : w.reduce((a, b) => a + b, 0) / w.length;
  });
  const vals = sm.filter((x): x is number => x !== null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const elo = Math.min(...exp), ehi = Math.max(...exp);
  const norm = (v: number, a: number, b: number) => (b - a < 1e-6 ? 0.5 : (v - a) / (b - a));
  const points: DynPoint[] = notes.map((n, i) => ({ i, measure: n.measure, expected: norm(exp[i], elo, ehi), actual: sm[i] === null ? null : norm(sm[i]!, lo, hi) }));
  const flags: DynFlag[] = [];
  let i = 0;
  while (i < exp.length - 1) {
    const dir = Math.sign(exp[i + 1] - exp[i]);
    if (dir === 0) { i++; continue; }
    let j = i + 1;
    while (j + 1 < exp.length && Math.sign(exp[j + 1] - exp[j]) === dir) j++;
    const dE = exp[j] - exp[i];
    if (j - i >= 2 && Math.abs(dE) >= 0.1) {
      const near = (k: number, step: number) => { for (let t = k; t >= i && t <= j; t += step) if (sm[t] !== null) return sm[t]; return null; };
      const a = near(i, 1), b = near(j, -1);
      if (a !== null && b !== null) {
        const dA = b - a;
        const ok = dir > 0 ? dA >= 2 : dA <= -2;
        if (!ok) flags.push({ kind: dir > 0 ? 'cresc' : 'dim', fromMeasure: notes[i].measure, toMeasure: notes[j].measure, expectedDelta: dE, actualDb: dA });
      }
    }
    i = j;
  }
  return { points, flags, hasDyn };
}

/** 소리 크기 기록 [초, dB] 에서 [a, b] 구간 평균 (없으면 null) */
export function meanDb(track: [number, number][], a: number, b: number): number | null {
  let s = 0, n = 0;
  for (let k = track.length - 1; k >= 0; k--) {
    const [t, d] = track[k];
    if (t < a) break;
    if (t <= b && Number.isFinite(d)) { s += d; n++; }
  }
  return n ? s / n : null;
}
