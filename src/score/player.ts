import { resumeAudio } from '../audio/context';
import { waveFor } from '../audio/timbre';
import { midiToFreq, getTranspose } from '../audio/notes';
import type { ParsedScore, ScoreNote } from './parse';
import { loadSamples, scheduleSampleNote } from '../audio/sampler';

export type Voice = 'sample' | 'synth';

/**
 * time·dur 는 초. shift: 악보 midi 에 더할 반음 수 (실음으로).
 * 표현 살리기: len = 실제로 소리 내는 길이(초), gain = 셈여림, legatoIn = 앞 음에서 이음줄로 이어짐(혀로 끊지 않음), accent = 강세
 */
export interface PlayEvent { note: ScoreNote; time: number; dur: number; inst?: 'clarinet' | 'piano'; shift?: number; len?: number; gain?: number; legatoIn?: boolean; accent?: boolean }
/** 반주 파트 (parse 를 allNotes 로 읽은 것) */
export interface AccPart { score: ParsedScore; inst: 'clarinet' | 'piano' }
export type Plan = { events: PlayEvent[]; clicks: { time: number; accent: boolean }[]; total: number; acc: PlayEvent[] };
/** 파트 이름으로 소리 고르기 */
export const instFor = (name: string): 'clarinet' | 'piano' => (/piano|klavier|피아노|pf\.?$|keyboard|organ|harp|cembalo|harpsichord|guitar|기타/i.test(name) ? 'piano' : 'clarinet');

/**
 * 악보 midi → 실음으로 옮길 반음 수.
 * 내 파트: 악보에 이조(transpose) 표시가 있으면 그 값, 없으면 지금 악기 설정(B♭ 이면 -2).
 * 반주 파트: 악보에 적힌 이조 값 (피아노는 0)
 */
export const mainShift = (s: ParsedScore) => (s.transpose !== 0 ? s.transpose : -getTranspose());
export interface PlanOptions { bpm: number; from: number; to: number; countIn: boolean; /** 셈여림·쐐기·스타카토·이음줄·늘임표·rit. 살리기 */ expressive?: boolean }

/** 셈여림 기호 → 소리 크기 (0~1) */
export const DYN_LEVEL: Record<string, number> = { pppp: 0.22, ppp: 0.27, pp: 0.33, p: 0.45, mp: 0.58, mf: 0.7, f: 0.85, ff: 0.97, fff: 1.05, ffff: 1.1, fp: 0.45 };
const DEFAULT_LEVEL = 0.7;
const WEDGE_STEP = 0.2; // 다음 셈여림 기호가 없을 때 크레셴도·디미누엔도로 바뀌는 정도

export interface NoteExpression { gain: number; tempo: number; accent: boolean }
/**
 * 파트 전체를 처음부터 훑어 음마다 소리 크기·빠르기 배율을 정함.
 * - 셈여림 기호는 그 음부터. 쐐기(< >)는 끝(다음 셈여림 기호 또는 ±한 단계)까지 고르게 바꿈
 * - rit./rall. 은 그 음부터 4분음표마다 3.5%씩 느려짐(최저 72%), a tempo 에서 원래대로
 */
export function expressNotes(s: ParsedScore): NoteExpression[] {
  const notes = s.notes;
  // 음마다 곡 처음부터의 위치 (4분음표)
  const mStart = new Map<number, number>();
  let accQ = 0;
  for (const m of s.measures) { mStart.set(m, accQ); accQ += s.measureLen.get(m) ?? 4; }
  const absQ = notes.map((n) => (mStart.get(n.measure) ?? 0) + n.beat);
  const out: NoteExpression[] = [];
  let level = DEFAULT_LEVEL;
  let ritFrom: number | null = null;
  let wedge: { from: number; to: number; i0: number; i1: number } | null = null;
  notes.forEach((n, i) => {
    const a = n.art ?? {};
    // 앞 쐐기가 이 음에서 끝났으면 그 끝 크기로
    if (wedge && i >= (wedge as { i1: number }).i1) { level = (wedge as { to: number }).to; wedge = null; }
    if (a.dyn && DYN_LEVEL[a.dyn] !== undefined) { level = DYN_LEVEL[a.dyn]; wedge = null; }
    if (a.wedge === 'stop' && wedge) { level = wedge.to; wedge = null; }
    if (a.wedge === 'cresc' || a.wedge === 'dim') {
      // 끝: 다음 stop 또는 다음 셈여림 기호 또는 다음 쐐기
      let j = i + 1;
      while (j < notes.length && !notes[j].art?.dyn && !notes[j].art?.wedge) j++;
      const endArt = notes[j]?.art;
      const target = endArt?.dyn && DYN_LEVEL[endArt.dyn] !== undefined ? DYN_LEVEL[endArt.dyn]
        : a.wedge === 'cresc' ? Math.min(1.05, level + WEDGE_STEP) : Math.max(0.22, level - WEDGE_STEP);
      wedge = { from: level, to: target, i0: i, i1: Math.max(i + 1, j) };
    }
    let g = level;
    if (wedge) {
      const w = wedge as { from: number; to: number; i0: number; i1: number };
      const t = (i - w.i0) / Math.max(1, w.i1 - w.i0);
      g = w.from + (w.to - w.from) * Math.min(1, t);
      if (i >= w.i1) { level = w.to; wedge = null; }
    }
    if (a.tempo === 'rit') ritFrom = absQ[i];
    if (a.tempo === 'atempo') ritFrom = null;
    const tempo = ritFrom === null ? 1 : Math.max(0.72, 1 - 0.035 * (absQ[i] + n.dur / 2 - ritFrom)); // 음 가운데 기준
    const accent = !!a.accent || a.dyn === 'sf' || a.dyn === 'sfz' || a.dyn === 'rf' || a.dyn === 'rfz';
    out.push({ gain: g, tempo, accent });
  });
  return out;
}

/** 구간의 음을 시간(초)으로. bpm 은 4분음표 기준 */
export function planPlayback(s: ParsedScore, o: PlanOptions, accParts: AccPart[] = []): Plan {
  const q = 60 / o.bpm;
  const [beats, unit] = s.time;
  const beatQ = 4 / unit; // 한 박 = 4분음표 몇 개
  const countQ = o.countIn ? beats * beatQ : 0;
  const start = new Map<number, number>();
  let acc = countQ;
  for (const m of s.measures) {
    if (m < o.from || m > o.to) continue;
    start.set(m, acc);
    acc += s.measureLen.get(m) ?? beats * beatQ;
  }
  const ex = o.expressive ? expressNotes(s) : null;
  const inRange = s.notes.map((n, i) => ({ n, i })).filter(({ n }) => start.has(n.measure));
  // 4분음표 위치 → 초. 표현을 살리면 음마다 빠르기 배율(rit.)과 늘임표(그 음 끝에 더 머묾)를 반영
  const bps: { Q: number; t: number; f: number }[] = [{ Q: 0, t: 0, f: 1 }];
  if (ex) {
    for (const { n, i } of inRange) {
      const Q = start.get(n.measure)! + n.beat;
      const last = bps[bps.length - 1];
      if (Q < last.Q - 1e-9) continue;
      const t = last.t + ((Q - last.Q) * q) / last.f;
      bps.push({ Q, t, f: ex[i].tempo });
      if (n.art?.fermata) {
        const Qe = Q + n.dur;
        const te = t + (n.dur * q) / ex[i].tempo;
        bps.push({ Q: Qe, t: te + Math.min(2, n.dur * q * 0.8 + 0.3), f: ex[i].tempo });
      }
    }
  }
  const qToT = (Q: number) => {
    if (!ex) return Q * q;
    let k = 0;
    for (let j = 0; j < bps.length; j++) if (bps[j].Q <= Q + 1e-9) k = j;
    return bps[k].t + ((Q - bps[k].Q) * q) / bps[k].f;
  };
  const shift = mainShift(s);
  const events: PlayEvent[] = inRange.map(({ n }) => {
    const Q = start.get(n.measure)! + n.beat;
    const time = qToT(Q);
    return { note: n, time, dur: qToT(Q + n.dur) - time, shift };
  });
  if (ex) {
    events.forEach((e, k) => {
      const a = e.note.art ?? {};
      const L = e.dur;
      const next = events[k + 1];
      const joined = !!next && next.time - (e.time + L) < 0.02; // 다음 음이 바로 이어짐 (쉼표 없음)
      const slur = !!a.slurNext && joined && !a.stacc;
      e.len = a.stacc ? Math.min(L * (a.slurNext ? 0.6 : 0.45), 0.4)
        : slur ? L + 0.05
          : a.tenuto ? L * 0.97
            : L - Math.min(0.08, L * 0.18);
      e.gain = ex[inRange[k].i].gain;
      e.accent = ex[inRange[k].i].accent;
      if (slur && next) next.legatoIn = true;
    });
  }
  const totalT = qToT(acc);
  const clicks: { time: number; accent: boolean }[] = [];
  for (let k = 0; k * beatQ < acc - 1e-9; k++) {
    const tq = k * beatQ;
    clicks.push({ time: qToT(tq), accent: k % beats === 0 });
  }
  const accEv: PlayEvent[] = [];
  for (const ap of accParts) {
    for (const n of ap.score.notes) {
      if (!start.has(n.measure)) continue;
      const Q = start.get(n.measure)! + n.beat;
      const time = qToT(Q);
      accEv.push({ note: n, time, dur: qToT(Q + n.dur) - time, inst: ap.inst, shift: ap.score.transpose });
    }
  }
  accEv.sort((a, b) => a.time - b.time);
  return { events, clicks, total: totalT, acc: accEv };
}

/** 악기 소리로 재생 (실음으로 옮겨서). stop() 을 돌려줌 */
export class ScorePlayer {
  private nodes: AudioScheduledSourceNode[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private ctx: AudioContext | null = null;
  playing = false;
  usedSample = false;
  /** 첫 박(카운트인 포함 계획의 0초)의 AudioContext 시각 */
  startedAt = 0;
  /** play/stop 할 때마다 증가: 샘플을 불러오는 동안 멈추거나 다시 누르면 앞의 재생은 취소 */
  private gen = 0;

  async play(
    plan: Plan,
    opts: { a4: number; click: boolean; volume?: number; voice?: Voice; onNote?: (e: PlayEvent | null, idx?: number) => void; onEnd?: () => void; mute?: boolean; accVolume?: number },
  ) {
    this.stop();
    const gen = this.gen;
    const ctx = await resumeAudio();
    if (gen !== this.gen) return;
    this.ctx = ctx;
    // 실제 악기 샘플 (못 불러오면 합성음으로)
    const useSample = (opts.voice ?? 'sample') === 'sample' && (await loadSamples(ctx));
    if (gen !== this.gen) return;
    this.playing = true;
    this.usedSample = useSample;
    const t0 = ctx.currentTime + 0.15;
    const wave = waveFor(ctx);
    const master = ctx.createGain();
    master.gain.value = opts.volume ?? 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    lp.connect(master).connect(ctx.destination);
    this.startedAt = t0;
    // 반주
    if (plan.acc.length) {
      const accGain = ctx.createGain();
      accGain.gain.value = opts.accVolume ?? 0.6;
      accGain.connect(master);
      for (const e of plan.acc) {
        const a = t0 + e.time;
        const m = e.note.midi + (e.shift ?? 0);
        if (e.inst === 'piano') { this.nodes.push(...pianoNote(ctx, accGain, midiToFreq(m, opts.a4), a, e.dur)); continue; }
        if (useSample) { const n = scheduleSampleNote(ctx, accGain, m, a, e.dur * 0.98, opts.a4, 0.8); if (n) { this.nodes.push(n); continue; } }
        this.nodes.push(...pianoNote(ctx, accGain, midiToFreq(m, opts.a4), a, e.dur));
      }
    }
    const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
    for (const [idx, e] of plan.events.entries()) {
      const a0 = t0 + e.time;
      this.timers.push(setTimeout(() => opts.onNote?.(e, idx), Math.max(0, (a0 - ctx.currentTime + lat) * 1000)));
      if (opts.mute) continue;
      const m = e.note.midi + (e.shift ?? 0);
      const level = e.gain === undefined ? 1 : e.gain / 0.75; // 표현 없음 = 예전 크기
      if (useSample) {
        // 다음 음과 살짝 겹치게 (레가토). 이음줄로 이어지는 음은 샘플의 어택을 건너뛰고 부드럽게
        const n = scheduleSampleNote(ctx, master, m, a0, e.len ?? e.dur * 0.98, opts.a4, 0.9 * level, { legatoIn: e.legatoIn, accent: e.accent });
        if (n) { this.nodes.push(n); continue; }
      }
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = midiToFreq(m, opts.a4);
      const g = ctx.createGain();
      const a = t0 + e.time, len = Math.max(0.05, e.len ?? e.dur * 0.92);
      const peak = Math.min(1.4, level * (e.accent ? 1.35 : 1));
      const att = e.legatoIn ? 0.04 : e.accent ? 0.008 : Math.min(0.02, len / 3);
      g.gain.setValueAtTime(e.legatoIn ? level * 0.6 : 0, a);
      g.gain.linearRampToValueAtTime(peak, a + att);
      if (e.accent) g.gain.linearRampToValueAtTime(level, a + att + 0.12);
      g.gain.setValueAtTime(level * 0.9, a + Math.max(att + 0.01, len * 0.6));
      g.gain.linearRampToValueAtTime(0, a + len);
      osc.connect(g).connect(lp);
      osc.start(a);
      osc.stop(a + len + 0.02);
      this.nodes.push(osc);
    }
    const firstNote = plan.events.length ? plan.events[0].time : Infinity;
    for (const c of plan.clicks) {
      if (!opts.click && c.time >= firstNote - 1e-6) continue; // 카운트인만
      const osc = ctx.createOscillator();
      osc.frequency.value = c.accent ? 1760 : 1320;
      const g = ctx.createGain();
      const a = t0 + c.time;
      g.gain.setValueAtTime(c.accent ? 0.35 : 0.22, a);
      g.gain.exponentialRampToValueAtTime(0.001, a + 0.05);
      osc.connect(g).connect(ctx.destination);
      osc.start(a);
      osc.stop(a + 0.06);
      this.nodes.push(osc);
    }
    this.timers.push(setTimeout(() => { this.playing = false; opts.onNote?.(null); opts.onEnd?.(); }, (t0 - ctx.currentTime + plan.total) * 1000 + 100));
  }

  stop() {
    this.gen++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const now = this.ctx?.currentTime ?? 0;
    for (const n of this.nodes) { try { n.stop(now); } catch { /* 이미 끝남 */ } }
    this.nodes = [];
    this.playing = false;
  }
}

export const scorePlayer = new ScorePlayer();

/** 간단한 피아노 비슷한 소리 (반주용): 빠른 어택, 지수 감쇠 */
function pianoNote(ctx: AudioContext, out: AudioNode, f: number, a: number, dur: number): AudioScheduledSourceNode[] {
  const g = ctx.createGain();
  const len = Math.min(Math.max(dur, 0.15), 2.5) + 0.3;
  g.gain.setValueAtTime(0, a);
  g.gain.linearRampToValueAtTime(0.32, a + 0.008);
  g.gain.exponentialRampToValueAtTime(0.12, a + 0.25);
  g.gain.setTargetAtTime(0.0001, a + Math.max(0.2, dur * 0.95), 0.08);
  g.connect(out);
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  o1.connect(g); o2.connect(g2).connect(g);
  o1.start(a); o2.start(a); o1.stop(a + len); o2.stop(a + len);
  return [o1, o2];
}

/** 재생 계획을 i 번째 음부터 잘라서 0초부터 시작하게 (재생 중 템포 바꿀 때) */
export function slicePlan(plan: Plan, i: number): Plan {
  const start = plan.events[i]?.time ?? 0;
  return {
    events: plan.events.slice(i).map((e) => ({ ...e, time: e.time - start })),
    clicks: plan.clicks.filter((c) => c.time >= start - 1e-6).map((c) => ({ ...c, time: c.time - start })),
    total: plan.total - start,
    acc: plan.acc.filter((e) => e.time >= start - 1e-6).map((e) => ({ ...e, time: e.time - start })),
  };
}
