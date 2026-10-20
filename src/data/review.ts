import type { Scored } from '../score/align';
import type { ReviewItem, ScoreRun } from './db';
import { addDays } from './dates';

/** 복습 간격 (일). box 0 → 1일 뒤, … 마지막 칸을 넘으면 졸업 */
export const REVIEW_DAYS = [1, 2, 4, 7, 14, 30];
/**
 * 음정 판정 기준 (설정의 엄격·보통·관대). 마디가 "틀림" = 맞은 음 평균이 노랑 한계(warn) 밖,
 * "깨끗함" = 모두 맞고 평균이 초록과 노랑 한계의 가운데 안 (보통이면 ±20 / ±15)
 */
export interface PitchLimits { good: number; warn: number }
const NORMAL: PitchLimits = { good: 10, warn: 20 };
const cleanLimit = (t: PitchLimits) => (t.good + t.warn) / 2;

export interface MeasureStat { measure: number; total: number; ok: number; meanAbs: number | null }

/** 채점 결과 → 마디별 맞은 음·평균 오차. 연주를 멈춘 뒤의 마디(모두 놓침)는 빼요 */
export function measureStats(rs: Scored[]): MeasureStat[] {
  let lastPlayed = -1;
  rs.forEach((r, i) => { if (r.status !== 'missed') lastPlayed = i; });
  if (lastPlayed < 0) return [];
  const lastMeasure = rs[lastPlayed].note.measure;
  const by = new Map<number, MeasureStat & { sum: number }>();
  for (const r of rs) {
    const m = r.note.measure;
    if (m > lastMeasure) continue;
    const s = by.get(m) ?? { measure: m, total: 0, ok: 0, meanAbs: null, sum: 0 };
    s.total++;
    if (r.status === 'ok') { s.ok++; s.sum += Math.abs(r.cents ?? 0); }
    by.set(m, s);
  }
  return [...by.values()].map(({ sum, ...s }) => ({ ...s, meanAbs: s.ok ? sum / s.ok : null }));
}
export const isWeak = (m: MeasureStat, t: PitchLimits = NORMAL) => m.total > 0 && (m.ok < m.total || (m.meanAbs ?? 0) > t.warn);
export const isClean = (m: MeasureStat, t: PitchLimits = NORMAL) => m.total > 0 && m.ok === m.total && (m.meanAbs === null || m.meanAbs <= cleanLimit(t));

export interface ReviewChange { put: ReviewItem[]; del: string[]; added: number[]; again: number[]; advanced: number[]; graduated: number[] }

/**
 * 한 번 채점한 결과로 복습함 바꾸기.
 * - 틀린 마디: 새로 넣거나(내일 복습) 이미 있으면 처음 칸으로
 * - 복습 날이 된 마디를 깨끗하게 치면 다음 칸으로 (마지막 칸이면 졸업)
 * - 아직 복습 날이 아닌 마디는 깨끗해도 그대로 (하루에 여러 번 쳐서 졸업하지 않게)
 */
export function reviewChanges(existing: Map<string, ReviewItem>, stats: MeasureStat[], scoreId: number, title: string, today: string, tol: PitchLimits = NORMAL): ReviewChange {
  const out: ReviewChange = { put: [], del: [], added: [], again: [], advanced: [], graduated: [] };
  for (const s of stats) {
    const id = `${scoreId}:${s.measure}`;
    const cur = existing.get(id);
    const pct = Math.round((s.ok / s.total) * 100);
    const base = { last: today, lastPct: pct, lastCents: s.meanAbs === null ? null : Math.round(s.meanAbs) };
    if (isWeak(s, tol)) {
      if (cur) {
        out.put.push({ ...cur, ...base, title, box: 0, due: addDays(today, REVIEW_DAYS[0]) });
        if (cur.due <= today || cur.box > 0) out.again.push(s.measure);
      } else {
        out.put.push({ id, scoreId, measure: s.measure, title, box: 0, due: addDays(today, REVIEW_DAYS[0]), added: today, ...base });
        out.added.push(s.measure);
      }
    } else if (cur && cur.due <= today && isClean(s, tol)) {
      const box = cur.box + 1;
      if (box >= REVIEW_DAYS.length) { out.del.push(id); out.graduated.push(s.measure); } else {
        out.put.push({ ...cur, ...base, title, box, due: addDays(today, REVIEW_DAYS[box]) });
        out.advanced.push(s.measure);
      }
    }
  }
  return out;
}

export function reviewMessage(c: ReviewChange): string | null {
  const parts: string[] = [];
  const ms = (a: number[]) => a.join('·');
  if (c.added.length) parts.push(`${ms(c.added)}마디를 복습함에 넣었어요`);
  if (c.again.length) parts.push(`${ms(c.again)}마디는 처음부터 다시`);
  if (c.advanced.length) parts.push(`${ms(c.advanced)}마디 복습 통과 (다음 복습은 더 나중에)`);
  if (c.graduated.length) parts.push(`${ms(c.graduated)}마디 졸업!`);
  return parts.length ? parts.join(' · ') : null;
}

/** 오늘 복습할 것: 악보별로 묶음 */
export function dueGroups(items: ReviewItem[], today: string): { scoreId: number; title: string; measures: ReviewItem[] }[] {
  const m = new Map<number, { scoreId: number; title: string; measures: ReviewItem[] }>();
  for (const it of items) {
    if (it.due > today) continue;
    const g = m.get(it.scoreId) ?? { scoreId: it.scoreId, title: it.title, measures: [] };
    g.measures.push(it);
    m.set(it.scoreId, g);
  }
  for (const g of m.values()) g.measures.sort((a, b) => a.measure - b.measure);
  return [...m.values()];
}

/** 이어진 마디끼리 묶기: [3,4,5,9] → [[3,5],[9,9]] */
export function measureRuns(ms: number[]): [number, number][] {
  const s = [...new Set(ms)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const m of s) {
    const l = out[out.length - 1];
    if (l && m === l[1] + 1) l[1] = m; else out.push([m, m]);
  }
  return out;
}

/** 음별 음정 합계 (맞은 음만, 부호 있는 센트) */
export function noteCentsOf(rs: Scored[]): [number, number, number][] {
  const m = new Map<number, [number, number]>();
  for (const r of rs) {
    if (r.status !== 'ok' || r.cents === null) continue;
    const v = m.get(r.note.midi) ?? [0, 0];
    v[0] += r.cents; v[1]++;
    m.set(r.note.midi, v);
  }
  return [...m.entries()].map(([k, [s, n]]) => [k, Math.round(s * 10) / 10, n]);
}

/** 템포 사다리 판정 */
export interface LadderInput { pct: number; target: number; bpm: number | null; rhythmMeanAbs: number | null; /** 맞은 음 평균 음정 오차 (센트). 판정 기준의 노랑 한계 안이어야 통과 */ meanAbs?: number | null; tol?: PitchLimits }
export interface LadderVerdict { pass: boolean; next: number; msg: string }
export const LADDER_STEP = 4;
export function ladderVerdict(o: LadderInput, max = 200): LadderVerdict {
  const slow = o.bpm !== null && o.bpm < o.target * 0.92;
  const loose = o.rhythmMeanAbs !== null && o.rhythmMeanAbs > 0.12;
  const t = o.tol ?? NORMAL;
  const offPitch = o.meanAbs !== undefined && o.meanAbs !== null && o.meanAbs > t.warn;
  if (o.pct >= 90 && !slow && !loose && !offPitch) {
    const next = Math.min(max, o.target + LADDER_STEP);
    return { pass: true, next, msg: `통과! ♩=${o.target} 성공 → 다음은 ♩=${next}` };
  }
  if (o.pct < 70) {
    const next = Math.max(30, o.target - LADDER_STEP);
    return { pass: false, next, msg: `맞은 음 ${o.pct}% — 한 칸 내려서 ♩=${next} 로 다시 해 봐요` };
  }
  const why = o.pct < 90 ? `맞은 음 ${o.pct}% (90% 이상이면 통과)` : offPitch ? `음정 평균 ±${Math.round(o.meanAbs!)}센트 (±${t.warn} 안이면 통과)` : slow ? `내 템포 ♩≈${Math.round(o.bpm!)} 로 목표보다 느렸어요` : '박자가 조금 흔들렸어요';
  return { pass: false, next: o.target, msg: `${why} — ♩=${o.target} 에서 한 번 더` };
}

/** 리드별 집계에 쓰는 채점 기록 요약 */
export const runPctOf = (r: Pick<ScoreRun, 'ok' | 'total'>) => Math.round((r.ok / Math.max(1, r.total)) * 100);
