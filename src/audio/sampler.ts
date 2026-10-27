import { P } from '../instruments/profiles';
import { LITE } from '../state/lite';
import { soundSetId } from './soundPrefs';
import { soundSetFor, layerOf, type SampleRow, type SampleSet } from './soundSets';
export type { SampleRow, SampleSet } from './soundSets';

/**
 * 악기 소리 (public/<악기>/…, NOTICE.txt 참고). 설정에서 고른 소리 한 벌(soundSets.ts)의
 * 셈여림 층마다 2~5반음 간격의 실음 샘플. 필요한 층만 처음 쓸 때 불러오고, 다른 소리로 바꾸면 앞의 것은 버려요(메모리).
 */
export const currentSet = (): SampleSet => soundSetFor(P.id, soundSetId(P.id));
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<boolean>>();
let loadedSet = '';
const keyOf = (set: SampleSet, name: string) => `${set.dir}/${name}`;

/** 셈여림(0~1, mf = 0.7) → 샘플 층 (고른 소리 기준) */
export function layerFor(level: number, set: SampleSet = currentSet()): string { return layerOf(set, level); }
const baseLayer = (set = currentSet()) => layerOf(set, 0.7);
export const layerReady = (layer: string, set = currentSet()) => (set.layers[layer] ?? []).every((r) => buffers.has(keyOf(set, r[0])));
export function samplesReady() { return layerReady(baseLayer()); }

function loadLayer(ctx: BaseAudioContext, set: SampleSet, layer: string): Promise<boolean> {
  const lk = `${set.id}:${layer}`;
  let p = loading.get(lk);
  if (!p) {
    const base = import.meta.env.BASE_URL;
    p = Promise.all((set.layers[layer] ?? []).map(async ([name]) => {
      const k = keyOf(set, name);
      if (buffers.has(k)) return;
      const res = await fetch(`${base}${set.dir}/${name}.mp3`);
      if (!res.ok) throw new Error(name);
      buffers.set(k, await ctx.decodeAudioData(await res.arrayBuffer()));
    })).then(() => true, () => { loading.delete(lk); return false; });
    loading.set(lk, p);
  }
  return p;
}

/**
 * 샘플 불러오기. levels = 이번에 쓸 셈여림들 (그 층도 함께). 가벼운 모드는 메모리를 아끼려고 기본 층만.
 * 기본 층을 못 불러오면 false (합성음으로)
 */
export async function loadSamples(ctx: BaseAudioContext, levels: number[] = []): Promise<boolean> {
  const set = currentSet();
  if (loadedSet !== set.id) { buffers.clear(); loading.clear(); loadedSet = set.id; }
  const want = new Set([baseLayer(set), ...(LITE ? [] : levels.map((l) => layerOf(set, l)))]);
  const res = await Promise.all([...want].map(async (l) => [l, await loadLayer(ctx, set, l)] as const));
  return res.find(([l]) => l === baseLayer(set))?.[1] ?? false;
}

/** 가장 가까운 샘플과 재생 속도 (샘플 자체 음정 오차까지 보정). midi 는 실음. 그 층이 아직 없으면 기본 층 */
export function pickSample(midi: number, a4 = 440, layer?: string, set: SampleSet = currentSet(), has: (n: string) => boolean = (n) => buffers.has(keyOf(set, n))): { row: SampleRow; rate: number; layer: string } | null {
  const rows = set.layers;
  let L = layer ?? baseLayer(set);
  let list = (rows[L] ?? []).filter((r) => has(r[0]));
  if (!list.length) { L = baseLayer(set); list = (rows[L] ?? []).filter((r) => has(r[0])); }
  if (!list.length) return null;
  let best = list[0];
  for (const r of list) if (Math.abs(r[1] - midi) < Math.abs(best[1] - midi)) best = r;
  const semis = midi - best[1] - best[2] / 100 + 12 * Math.log2(a4 / 440);
  return { row: best, rate: Math.pow(2, semis / 12), layer: L };
}

const START = 0.02; // 샘플 앞(인코더 지연 포함)
const XF = 0.3; // 긴 음: 다음 조각과 겹쳐 넘기는 시간
const REL = 0.09; // 끝: 숨을 거두는 시간 상수
/** 샘플은 지속음 -18 dBFS 로 맞춰 둠 → 예전 샘플과 비슷한 크기로 */
const LOUD = 2.1;

export interface SampleNoteOpts {
  legatoIn?: boolean; accent?: boolean;
  /** 셈여림 (0~1, mf 0.7): 샘플 층과 밝기 */ level?: number;
  /** 끝 무렵 소리 크기 배율 (크레셴도·디미누엔도로 다음 음까지 이어질 때) */ gainEnd?: number;
}

/**
 * 한 음 예약 (midi 는 실음). 소리 나는 노드들을 돌려줌.
 * - 이음줄로 이어지는 음은 녹음의 어택(혀 소리)을 건너뛰고 겹쳐 들어옴
 * - 샘플(4초)보다 긴 음은 지속음 구간을 겹쳐 이어 붙여 끝까지
 * - 셈여림에 따라 샘플 층을 고르고, 같은 층 안에서는 밝기(저역 통과)로 조금 더
 */
export function scheduleSampleNote(
  ctx: BaseAudioContext, dest: AudioNode, midi: number, when: number, dur: number, a4 = 440, gain = 1,
  o: SampleNoteOpts = {},
): AudioBufferSourceNode[] | null {
  const level = o.level ?? 0.7;
  gain *= LOUD;
  const set = currentSet();
  const pick = pickSample(midi, a4, layerOf(set, level), set);
  if (!pick) return null;
  const buffer = buffers.get(keyOf(set, pick.row[0]))!;
  const rate = pick.rate, attack = pick.row[3];
  const len = Math.max(0.06, dur);
  // 소리 크기 (음 전체 모양)
  const env = ctx.createGain();
  const att = o.legatoIn ? 0.05 : o.accent ? 0.006 : 0.012;
  const peak = o.accent ? gain * 1.35 : gain;
  env.gain.setValueAtTime(o.legatoIn ? gain * 0.35 : 0, when);
  env.gain.linearRampToValueAtTime(peak, when + att);
  if (o.accent) env.gain.linearRampToValueAtTime(gain, when + att + 0.12);
  const end = gain * (o.gainEnd ?? 1);
  if (o.gainEnd !== undefined && len > 0.25) {
    env.gain.setValueAtTime(gain, when + Math.min(len * 0.3, att + 0.15));
    env.gain.linearRampToValueAtTime(end, when + len);
  } else env.gain.setValueAtTime(gain, Math.max(when + att + 0.01, when + len - 0.01));
  env.gain.setTargetAtTime(0, when + len, REL);
  const stopAt = when + len + REL * 5;
  let out: AudioNode = env;
  if (!LITE) {
    // 같은 층 안에서도 여리면 조금 어둡게
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(18000, 2200 + 16000 * Math.min(1, level) ** 2);
    lp.Q.value = 0.5;
    env.connect(lp);
    out = lp;
  }
  out.connect(dest);
  // 소리 조각들: 첫 조각은 처음부터(이음줄이면 어택 뒤부터), 그다음은 지속음 구간에서 겹쳐 이어 붙임
  const srcs: AudioBufferSourceNode[] = [];
  const first = o.legatoIn ? START + attack : START;
  const loopFrom = Math.min(buffer.duration - 1.2, attack + 0.6);
  const root = pick.row[1] + pick.row[2] / 100;
  let t = when, off = first, k = 0;
  while (k < 12) {
    const avail = (buffer.duration - off - 0.08) / rate; // 이 조각이 낼 수 있는 시간(초)
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const xg = ctx.createGain();
    src.connect(xg).connect(env);
    const last = t + avail >= stopAt;
    if (k > 0) { xg.gain.setValueAtTime(0, t); xg.gain.linearRampToValueAtTime(1, t + XF); }
    if (!last) { xg.gain.setValueAtTime(1, t + avail - XF); xg.gain.linearRampToValueAtTime(0, t + avail); }
    src.start(t, off);
    src.stop(last ? stopAt : t + avail + 0.01);
    srcs.push(src);
    if (last) break;
    // 다음 조각은 지속음 구간에서, 지금 조각이 넘겨주는 곳과 파형 위상이 맞는 자리부터 (겹칠 때 소리가 꺼지지 않게)
    off = alignedOffset(buffer, off + (avail - XF) * rate, loopFrom, root);
    t = t + avail - XF;
    k++;
  }
  return srcs;
}

/**
 * 같은 녹음의 두 자리를 겹쳐 이을 때 위상 맞추기: target 근처(±한 주기)에서 from 자리의 파형과 가장 닮은 곳 (초).
 * 위상이 어긋나면 겹치는 동안 서로 지워져 소리가 푹 꺼짐
 */
const alignCache = new WeakMap<AudioBuffer, Map<string, number>>();
export function alignedOffset(buf: AudioBuffer, from: number, target: number, rootMidi: number): number {
  const key = `${Math.round(from * 1000)}:${Math.round(target * 1000)}`;
  let m = alignCache.get(buf);
  if (!m) { m = new Map(); alignCache.set(buf, m); }
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  // 넓게(±0.12초, 4칸씩) 훑고 가장 닮은 곳 근처를 한 칸씩: 비브라토·떨림의 흐름까지 맞추기
  const W = 2048, a = Math.floor(from * sr), t0 = Math.floor(target * sr);
  const span = Math.max(Math.round(0.12 * sr), Math.round(sr / (440 * Math.pow(2, (rootMidi - 69) / 12))));
  let best = t0;
  if (a + W < d.length) {
    let ea = 0;
    for (let i = 0; i < W; i++) ea += d[a + i] * d[a + i];
    const score = (t: number) => {
      let c = 0, et = 0;
      for (let i = 0; i < W; i++) { c += d[a + i] * d[t + i]; et += d[t + i] * d[t + i]; }
      return c / Math.sqrt(ea * et + 1e-12);
    };
    const lo = Math.max(0, t0 - span), hi = Math.min(d.length - W - 1, t0 + span);
    let bestC = -Infinity;
    for (let t = lo; t <= hi; t += 4) { const c = score(t); if (c > bestC) { bestC = c; best = t; } }
    const c0 = best;
    for (let t = Math.max(lo, c0 - 4); t <= Math.min(hi, c0 + 4); t++) { const c = score(t); if (c > bestC) { bestC = c; best = t; } }
  }
  const r = best / sr;
  m.set(key, r);
  return r;
}

/** 울림(리버브) 임펄스 응답: 짧은 초기 반사 + 어두워지며 사라지는 꼬리 (스테레오) */
const irCache = new Map<string, AudioBuffer>();
export function reverbIR(ctx: BaseAudioContext, decay: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${decay}`;
  const hit = irCache.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate, n = Math.floor(sr * decay);
  const ir = ctx.createBuffer(2, n, sr);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / sr;
      const pre = tt < 0.012 ? 0 : 1;
      // 시간이 갈수록 높은 소리가 먼저 사라지게 (한 극 저역 통과, 계수가 점점 작아짐)
      const a = 0.55 - 0.45 * (tt / decay);
      lp += a * (rnd() - lp);
      d[i] = pre * lp * Math.exp((-6.9 * tt) / decay);
    }
    // 초기 반사 몇 개
    for (const [ms, g] of [[11, 0.5], [17, 0.35], [23, 0.3], [31, 0.22], [41, 0.16]] as const) {
      const i = Math.floor(((ms + (ch ? 3 : 0)) / 1000) * sr);
      if (i < n) d[i] += g;
    }
  }
  irCache.set(key, ir);
  return ir;
}
