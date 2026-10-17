import { freqToMidiFloat } from './notes';

/**
 * 롱톤 분석: 한 음을 길게 불 때의 길이, 음정(센트)·소리 크기(dB)의 흔들림, 끝에서 처지는지,
 * 크게 불 때 음정이 어떻게 변하는지(dB 와 센트의 기울기)를 잽니다.
 */
export interface TonePoint { t: number; cents: number | null; db: number }
export interface LongToneResult {
  midi: number;
  start: number;
  durationSec: number;
  /** 시작 0.3초를 뺀 안정 구간 통계 */
  meanCents: number;
  centsSD: number;
  dbMean: number;
  dbSD: number;
  /** 음정이 시간에 따라 변한 정도 (센트/초, 끝으로 갈수록 처지면 음수) */
  driftPerSec: number;
  /** 1dB 크게 불 때 음정 변화 (센트/dB). 크레셴도 연습에서 의미 있음 */
  centsPerDb: number | null;
  /** dB 범위 (크레셴도·디크레셴도 폭) */
  dbRange: number;
  points: TonePoint[];
}

const START_SKIP = 0.3; // 시작(텅잉·어택) 구간은 통계에서 뺌
const GAP = 0.25; // 이만큼 소리가 끊기면 끝
const MIN_LEN = 1.0; // 이보다 짧으면 롱톤으로 치지 않음

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
/** 최소제곱 기울기 */
export function slope(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den > 0 ? num / den : 0;
}

/** 소리 크기가 무한대(-Infinity)인 점은 빼고 기울기 */
function slopeFinite(xs: number[], ys: number[]) { const i = xs.map((x, k) => k).filter((k) => Number.isFinite(xs[k])); return slope(i.map((k) => xs[k]), i.map((k) => ys[k])); }

export function analyzeTone(points: TonePoint[], midi: number): LongToneResult | null {
  if (points.length < 3) return null;
  const start = points[0].t;
  const end = points[points.length - 1].t;
  const dur = end - start;
  if (dur < MIN_LEN) return null;
  const body = points.filter((p) => p.t - start >= START_SKIP && p.cents !== null) as (TonePoint & { cents: number })[];
  const use = body.length >= 5 ? body : (points.filter((p) => p.cents !== null) as (TonePoint & { cents: number })[]);
  if (use.length < 3) return null;
  const cents = use.map((p) => p.cents), ts = use.map((p) => p.t - start);
  const dbsAll = use.map((p) => p.db), dbs = dbsAll.filter((d) => Number.isFinite(d));
  const dbRange = dbs.length ? Math.max(...dbs) - Math.min(...dbs) : 0;
  return {
    midi,
    start,
    durationSec: dur,
    meanCents: mean(cents),
    centsSD: sd(cents),
    dbMean: mean(dbs),
    dbSD: sd(dbs),
    driftPerSec: slope(ts, cents),
    centsPerDb: dbRange >= 6 ? slopeFinite(dbsAll, cents) : null,
    dbRange,
    points,
  };
}

/** 실시간 롱톤 추적: 소리가 이어지는 동안 모으고, 끊기면 결과를 돌려줌 */
export class LongToneTracker {
  /** m = midi 실수값 (센트는 기준 음이 정해진 뒤 계산) */
  private pts: { t: number; m: number; db: number }[] = [];
  private midiVotes = new Map<number, number>();
  private last = -Infinity;
  private midi: number | null = null;
  constructor(private a4 = 440) {}

  get active() { return this.pts.length > 0; }
  get elapsed() { return this.pts.length ? this.pts[this.pts.length - 1].t - this.pts[0].t : 0; }
  get points(): TonePoint[] { const b = this.midi ?? 0; return this.pts.map((p) => ({ t: p.t, cents: (p.m - b) * 100, db: p.db })); }
  get currentMidi() { return this.midi; }

  /** freq 는 악보음 주파수(없으면 무음). 끝난 롱톤이 있으면 결과 */
  push(t: number, freq: number | null, db: number): LongToneResult | null {
    if (freq === null) {
      if (this.pts.length && t - this.last > GAP) return this.finish();
      return null;
    }
    const m = freqToMidiFloat(freq, this.a4);
    const near = Math.round(m);
    // 다른 음으로 크게 바뀌면(반음 넘게) 지금 롱톤을 끝내고 새로 시작
    if (this.midi !== null && Math.abs(m - this.midi) > 0.75) {
      const r = this.finish();
      this.start(near);
      this.add(t, m, db);
      return r;
    }
    if (this.midi === null) this.start(near);
    this.add(t, m, db);
    return null;
  }

  private start(midi: number) { this.pts = []; this.midiVotes.clear(); this.midi = midi; }
  private add(t: number, m: number, db: number) {
    const near = Math.round(m);
    this.midiVotes.set(near, (this.midiVotes.get(near) ?? 0) + 1);
    // 가장 많이 나온 음을 기준으로
    let best = this.midi!, n = -1;
    for (const [k, v] of this.midiVotes) if (v > n) { n = v; best = k; }
    this.midi = best;
    this.pts.push({ t, m, db });
    this.last = t;
  }

  /** 지금까지 모은 것을 끝내고 결과 */
  finish(): LongToneResult | null {
    const midi = this.midi;
    const pts = this.points;
    this.pts = [];
    this.midiVotes.clear();
    this.midi = null;
    if (midi === null) return null;
    return analyzeTone(pts, midi);
  }

  reset() { this.pts = []; this.midiVotes.clear(); this.midi = null; }
}

/** 결과를 말로 */
export function toneAdvice(r: LongToneResult, pattern: 'steady' | 'swell'): string[] {
  const out: string[] = [];
  if (r.centsSD <= 4) out.push('음정이 아주 고르게 유지됐어요.');
  else if (r.centsSD <= 8) out.push('음정 흔들림이 적당해요. 숨을 일정하게 밀어 주면 더 좋아져요.');
  else out.push('음정이 많이 흔들려요. 배로 숨을 받치고 입술(앙부슈르)은 움직이지 않게 해 보세요.');
  if (Math.abs(r.driftPerSec) * r.durationSec >= 10) {
    out.push(r.driftPerSec < 0 ? '끝으로 갈수록 음이 처져요. 숨이 줄어도 숨 속도를 유지하세요.' : '끝으로 갈수록 음이 올라가요. 입술을 조이지 않는지 확인해 보세요.');
  }
  if (pattern === 'steady') {
    if (r.dbSD <= 1.5) out.push('소리 크기가 일정해요.');
    else if (r.dbSD > 3) out.push('소리 크기가 들쭉날쭉해요. 숨을 같은 세기로 길게 내보내는 연습을 해 보세요.');
  } else {
    if (r.dbRange < 8) out.push('크기 변화가 작아요. 더 작게 시작해서 더 크게 키워 보세요.');
    if (r.centsPerDb !== null && Math.abs(r.centsPerDb) >= 1) {
      out.push(r.centsPerDb > 0 ? `크게 불수록 음이 올라가요 (1dB에 +${r.centsPerDb.toFixed(1)}센트). 크게 불 때 입술을 조이지 마세요.`
        : `크게 불수록 음이 내려가요 (1dB에 ${r.centsPerDb.toFixed(1)}센트). 작게 불 때 숨 속도를 유지하세요.`);
    }
  }
  return out;
}
