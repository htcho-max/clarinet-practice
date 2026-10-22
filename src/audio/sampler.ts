import { P } from '../instruments/profiles';
import { LITE } from '../state/lite';
import { fluteVibratoOn } from './soundPrefs';

/**
 * 실제 악기 녹음 샘플 (public/<악기>/, NOTICE.txt 참고 — VSCO 2 CE, CC0).
 * 셈여림 층(클라리넷 p·mf·f, 플룻 vib·p·f)마다 3~5반음 간격의 실음 샘플. 필요한 층만 처음 쓸 때 불러와요.
 * 매니페스트 줄: [파일 이름, 실음 midi, 샘플 자체 음정 오차(센트), 어택 길이(초)]
 */
export type SampleRow = [string, number, number, number];
export interface SampleManifest { keep: number; layers: Record<string, SampleRow[]> }

const MAN = P.sampleManifest;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<boolean>>();

/** 셈여림(0~1, mf = 0.7) → 샘플 층 */
export function layerFor(level: number, inst: string = P.id, vib = fluteVibratoOn()): string {
  if (inst === 'flute') return vib ? 'vib' : level < 0.65 ? 'p' : 'f';
  return level < 0.52 ? 'p' : level < 0.8 ? 'mf' : 'f';
}
const baseLayer = () => layerFor(0.7);
export const layerReady = (layer: string) => (MAN.layers[layer] ?? []).every((r) => buffers.has(r[0]));
export function samplesReady() { return layerReady(baseLayer()); }
export const SAMPLE_NAMES = Object.values(MAN.layers).flat().map((r) => r[0]);

function loadLayer(ctx: BaseAudioContext, layer: string): Promise<boolean> {
  let p = loading.get(layer);
  if (!p) {
    const base = import.meta.env.BASE_URL;
    p = Promise.all((MAN.layers[layer] ?? []).map(async ([name]) => {
      if (buffers.has(name)) return;
      const res = await fetch(`${base}${P.sampleDir}/${name}.mp3`);
      if (!res.ok) throw new Error(name);
      buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
    })).then(() => true, () => { loading.delete(layer); return false; });
    loading.set(layer, p);
  }
  return p;
}

/**
 * 샘플 불러오기. levels = 이번에 쓸 셈여림들 (그 층도 함께). 가벼운 모드는 메모리를 아끼려고 기본 층만.
 * 기본 층을 못 불러오면 false (합성음으로)
 */
export async function loadSamples(ctx: BaseAudioContext, levels: number[] = []): Promise<boolean> {
  const want = new Set([baseLayer(), ...(LITE ? [] : levels.map((l) => layerFor(l)))]);
  const res = await Promise.all([...want].map(async (l) => [l, await loadLayer(ctx, l)] as const));
  return res.find(([l]) => l === baseLayer())?.[1] ?? false;
}

/** 가장 가까운 샘플과 재생 속도 (샘플 자체 음정 오차까지 보정). midi 는 실음. 그 층이 아직 없으면 기본 층 */
export function pickSample(midi: number, a4 = 440, layer = baseLayer(), rows: Record<string, SampleRow[]> = MAN.layers, has: (n: string) => boolean = (n) => buffers.has(n)): { row: SampleRow; rate: number; layer: string } | null {
  let L = layer;
  let list = (rows[L] ?? []).filter((r) => has(r[0]));
  if (!list.length) { L = Object.keys(rows).find((k) => k === baseLayer()) ?? Object.keys(rows)[0]; list = (rows[L] ?? []).filter((r) => has(r[0])); }
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
  const pick = pickSample(midi, a4, layerFor(level));
  if (!pick) return null;
  const buffer = buffers.get(pick.row[0])!;
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
    t = t + avail - XF;
    off = loopFrom;
    k++;
  }
  return srcs;
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
