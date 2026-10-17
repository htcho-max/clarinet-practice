import { P } from '../instruments/profiles';

/**
 * 실제 악기 녹음 샘플 (public/<악기>/, NOTICE.txt 참고). 처음 쓸 때 한 번 불러옴.
 * 샘플 이름과 midi 는 실음(콘서트 피치) 기준. [midi, 샘플 자체 음정 오차(센트)]
 */
const SAMPLES = Object.entries(P.sampleTuning)
  .map(([name, [midi, cents]]) => ({ name, midi, cents }))
  .sort((a, b) => a.midi - b.midi);

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<boolean> | null = null;

export function samplesReady() { return buffers.size === SAMPLES.length; }
export const SAMPLE_NAMES = SAMPLES.map((s) => s.name);

export function loadSamples(ctx: BaseAudioContext): Promise<boolean> {
  if (!loading) {
    const base = import.meta.env.BASE_URL;
    loading = Promise.all(SAMPLES.map(async (s) => {
      const res = await fetch(`${base}${P.sampleDir}/${s.name}.mp3`);
      if (!res.ok) throw new Error(s.name);
      buffers.set(s.name, await ctx.decodeAudioData(await res.arrayBuffer()));
    })).then(() => true, () => { loading = null; return false; });
  }
  return loading;
}

/** 가장 가까운 샘플 이름과 재생 속도 (샘플 자체 음정 오차까지 보정). midi 는 실음 */
export function pickSampleName(midi: number, a4 = 440): { name: string; rate: number } {
  let best = SAMPLES[0];
  for (const s of SAMPLES) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
  const semis = midi - best.midi - best.cents / 100 + 12 * Math.log2(a4 / 440);
  return { name: best.name, rate: Math.pow(2, semis / 12) };
}

const ONSET = 0.025; // 샘플 앞의 무음
const LEGATO_SKIP = 0.15; // 이음줄 음은 어택을 건너뛰고 이만큼 뒤부터

/** 한 음 예약 (midi 는 실음). 끝나는 노드를 돌려줌 */
export function scheduleSampleNote(
  ctx: BaseAudioContext, dest: AudioNode, midi: number, when: number, dur: number, a4 = 440, gain = 1,
  o: { legatoIn?: boolean; accent?: boolean } = {},
): AudioBufferSourceNode | null {
  const pick = pickSampleName(midi, a4);
  const buffer = buffers.get(pick.name);
  if (!buffer) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = pick.rate;
  const g = ctx.createGain();
  // 이음줄로 이어지는 음: 녹음의 어택(혀 소리)을 건너뛰고 짧게 겹쳐 들어옴
  const offset = o.legatoIn ? ONSET + LEGATO_SKIP : ONSET;
  const len = Math.max(0.06, Math.min(dur, buffer.duration / pick.rate - offset - 0.2));
  const rel = Math.min(0.08, len * 0.3);
  const att = o.legatoIn ? 0.035 : o.accent ? 0.008 : 0.02;
  const peak = o.accent ? gain * 1.35 : gain;
  g.gain.setValueAtTime(o.legatoIn ? gain * 0.5 : 0, when);
  g.gain.linearRampToValueAtTime(peak, when + att);
  if (o.accent) g.gain.linearRampToValueAtTime(gain, when + att + 0.12);
  g.gain.setValueAtTime(gain, Math.max(when + att + 0.01, when + len - rel * 0.3));
  g.gain.linearRampToValueAtTime(0, when + len + rel);
  src.connect(g).connect(dest);
  src.start(when, offset);
  src.stop(when + len + rel + 0.02);
  return src;
}
