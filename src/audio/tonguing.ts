import { getAudioContext } from './context';
import { pitchTracker } from './pitchTracker';

/**
 * 텅잉 분석. 혀로 리드를 끊었다 놓을 때마다 소리 크기가 잠깐 줄었다가 다시 커지는 순간(어택)을 찾아
 * 메트로놈 박과 비교합니다. 시각은 모두 AudioContext 시간(초).
 */
export interface EnvPoint { t: number; db: number }

const BLOCK = 256; // 약 5ms (48kHz)

/** 마이크 소리 크기를 5ms 간격으로 (requestAnimationFrame 마다 새로 들어온 부분만) */
export class EnvelopeTracker {
  private an: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private buf = new Float32Array(4096);
  private lastEnd = 0;
  private raf = 0;
  private onPoints: ((p: EnvPoint[]) => void) | null = null;

  start(onPoints: (p: EnvPoint[]) => void) {
    const stream = pitchTracker.mediaStream;
    if (!stream) throw new Error('마이크가 꺼져 있어요');
    const ctx = getAudioContext();
    this.src = ctx.createMediaStreamSource(stream);
    this.an = ctx.createAnalyser();
    this.an.fftSize = 4096;
    this.src.connect(this.an);
    this.onPoints = onPoints;
    this.lastEnd = ctx.currentTime;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.read();
    };
    loop();
  }

  private read() {
    const an = this.an;
    if (!an) return;
    const ctx = an.context;
    const sr = ctx.sampleRate;
    const end = ctx.currentTime;
    an.getFloatTimeDomainData(this.buf);
    const newSamples = Math.min(this.buf.length, Math.round((end - this.lastEnd) * sr));
    if (newSamples < BLOCK) return;
    const startIdx = this.buf.length - newSamples;
    const pts: EnvPoint[] = [];
    for (let i = startIdx; i + BLOCK <= this.buf.length; i += BLOCK) {
      let s = 0;
      for (let j = i; j < i + BLOCK; j++) s += this.buf[j] * this.buf[j];
      const rms = Math.sqrt(s / BLOCK);
      pts.push({ t: end - (this.buf.length - (i + BLOCK)) / sr, db: rms > 0 ? 20 * Math.log10(rms) : -120 });
    }
    this.lastEnd = end - ((this.buf.length - startIdx) % BLOCK) / sr;
    if (pts.length) this.onPoints?.(pts);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.src?.disconnect();
    this.src = null;
    this.an = null;
    this.onPoints = null;
  }
}

export interface OnsetOptions {
  /** 이보다 작은 소리는 무시 (dBFS) */
  floorDb: number;
  /** 직전 최저점보다 이만큼 커져야 어택 */
  riseDb?: number;
  /** 두 어택 사이 최소 간격 (초) */
  minGap?: number;
}

/**
 * 어택 찾기: 최근 40ms 의 가장 작은 값보다 riseDb 이상 커지고, 35~60ms 뒤에도 소리가 이어지면(메트로놈 클릭 제외) 어택.
 * 어택 시각은 상승의 중간 지점.
 */
export function findOnsets(env: EnvPoint[], o: OnsetOptions): number[] {
  const rise = o.riseDb ?? 9;
  const minGap = o.minGap ?? 0.06;
  const out: number[] = [];
  let lastOnset = -Infinity;
  let j0 = 0;
  for (let i = 1; i < env.length; i++) {
    const p = env[i];
    if (p.db < o.floorDb) continue;
    if (p.t - lastOnset < minGap) continue;
    while (env[j0].t < p.t - 0.04) j0++;
    let minDb = Infinity, minK = j0;
    for (let k = j0; k < i; k++) if (env[k].db < minDb) { minDb = env[k].db; minK = k; }
    if (p.db - minDb < rise) continue;
    // 소리가 이어지는지 (35~60ms 뒤 평균이 어택 크기에서 12dB 안)
    const later = env.filter((q) => q.t >= p.t + 0.035 && q.t <= p.t + 0.06);
    if (later.length === 0) {
      if (env[env.length - 1].t < p.t + 0.06) break; // 아직 데이터가 안 옴 → 다음에 다시
      continue;
    }
    const lat = later.reduce((a, q) => a + q.db, 0) / later.length;
    if (lat < p.db - 12 || lat < o.floorDb) continue;
    // 상승 중간 지점
    const half = minDb + (p.db - minDb) / 2;
    let k = minK;
    while (k < i && env[k].db < half) k++;
    out.push(env[k].t);
    lastOnset = p.t;
  }
  return out;
}

export interface TongueResult {
  bpm: number;
  perBeat: number;
  expected: number;
  hits: number;
  missed: number;
  extra: number;
  /** 평균 박 어긋남 (ms, + 면 늦음) */
  meanMs: number | null;
  meanAbsMs: number | null;
  /** 어택 간격의 고르기 (간격 표준편차 / 목표 간격, %) */
  evenPct: number | null;
  /** 실제 템포 (어택 간격으로) */
  actualBpm: number | null;
  /** 박마다 [목표 시각, 실제 어택 시각 | null] (시작 기준 초) */
  grid: { t: number; hit: number | null }[];
  onsets: number[];
}

/**
 * 어택을 박자표와 맞추기. start = 첫 음의 목표 시각, count = 목표 음 수.
 * 목표 간격의 40% 안에 있는 가장 가까운 어택을 그 박의 음으로 봄.
 */
export function scoreTonguing(onsets: number[], start: number, bpm: number, perBeat: number, count: number): TongueResult {
  const iv = 60 / bpm / perBeat;
  const win = iv * 0.4;
  const used = new Set<number>();
  const grid: { t: number; hit: number | null }[] = [];
  for (let k = 0; k < count; k++) {
    const t = start + k * iv;
    let best = -1, bestD = Infinity;
    onsets.forEach((o, i) => { const d = Math.abs(o - t); if (!used.has(i) && d <= win && d < bestD) { best = i; bestD = d; } });
    if (best >= 0) used.add(best);
    grid.push({ t: t - start, hit: best >= 0 ? onsets[best] - start : null });
  }
  const inRange = onsets.filter((o) => o >= start - win && o <= start + (count - 1) * iv + win);
  const errs = grid.filter((g) => g.hit !== null).map((g) => (g.hit! - g.t) * 1000);
  const hits = errs.length;
  const mean = hits ? errs.reduce((a, b) => a + b, 0) / hits : null;
  const meanAbs = hits ? errs.reduce((a, b) => a + Math.abs(b), 0) / hits : null;
  // 이웃한 두 박이 모두 맞았을 때의 간격
  const ivs: number[] = [];
  for (let k = 1; k < grid.length; k++) if (grid[k].hit !== null && grid[k - 1].hit !== null) ivs.push(grid[k].hit! - grid[k - 1].hit!);
  let evenPct: number | null = null, actualBpm: number | null = null;
  if (ivs.length >= 3) {
    const m = ivs.reduce((a, b) => a + b, 0) / ivs.length;
    const sd = Math.sqrt(ivs.reduce((a, b) => a + (b - m) ** 2, 0) / ivs.length);
    evenPct = (sd / iv) * 100;
  }
  // 실제 템포: 맞춘 어택 시각을 박 번호에 대해 직선으로 (기울기 = 실제 간격)
  const pairs = grid.map((g, k) => [k, g.hit] as const).filter((x): x is readonly [number, number] => x[1] !== null);
  if (pairs.length >= 4) {
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    let num = 0, den = 0;
    for (const [x, y] of pairs) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    const step = den > 0 ? num / den : 0;
    if (step > 0) actualBpm = 60 / (step * perBeat);
  }
  return { bpm, perBeat, expected: count, hits, missed: count - hits, extra: Math.max(0, inRange.length - hits), meanMs: mean, meanAbsMs: meanAbs, evenPct, actualBpm, grid, onsets };
}

export function tongueAdvice(r: TongueResult): string[] {
  const out: string[] = [];
  if (r.hits < r.expected * 0.6) out.push('어택을 많이 못 찾았어요. 음마다 "투-투-투" 하고 혀끝으로 리드를 분명하게 놓아 보세요. 소리가 너무 작아도 못 찾아요.');
  if (r.meanMs !== null && Math.abs(r.meanMs) >= 25) out.push(r.meanMs > 0 ? `평균 ${Math.round(r.meanMs)}ms 늦어요. 혀를 미리 리드에 대고 준비했다가 박에 맞춰 놓아 보세요.` : `평균 ${Math.round(-r.meanMs)}ms 빨라요. 서두르지 말고 박을 기다려 보세요.`);
  if (r.evenPct !== null) {
    if (r.evenPct <= 8) out.push('음 간격이 아주 고르게 나왔어요.');
    else if (r.evenPct > 15) out.push('음 간격이 고르지 않아요. 더 느린 템포에서 혀만 움직이고 턱·목은 그대로 두는 연습을 해 보세요.');
  }
  if (r.actualBpm !== null && Math.abs(r.actualBpm - r.bpm) / r.bpm >= 0.05) out.push(r.actualBpm > r.bpm ? `점점 빨라졌어요 (실제 ♩=${Math.round(r.actualBpm)}).` : `점점 느려졌어요 (실제 ♩=${Math.round(r.actualBpm)}).`);
  if (r.extra > 2) out.push('박 사이에 어택이 더 있었어요. 음이 끊어지거나 리드가 울컥거리지 않는지 확인해 보세요.');
  return out;
}
