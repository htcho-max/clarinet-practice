/** 듣고 따라 불기: 짧은 악구 만들기·채점 (악보음 midi) */
import type { InstrumentId } from '../instruments/current';

export interface EchoPool { id: string; label: string; notes: number[] }

const C = (lo: number, hi: number, scale = [0, 2, 4, 5, 7, 9, 11]) => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
};
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
const G_MAJOR = [7, 9, 11, 0, 2, 4, 6];

export const ECHO_POOLS: Record<InstrumentId, EchoPool[]> = {
  clarinet: [
    { id: 'three', label: '왼손 세 음 (E·F·G)', notes: [64, 65, 67] },
    { id: 'five', label: '다섯 음 (C~G)', notes: [60, 62, 64, 65, 67] },
    { id: 'low', label: '낮은 음역 (G3~G4)', notes: C(55, 67, G_MAJOR) },
    { id: 'throat', label: '스로트까지 (C4~B♭4)', notes: [60, 62, 64, 65, 67, 69, 70] },
    { id: 'cross', label: '브레이크 넘기 (E4~E5)', notes: C(64, 76) },
    { id: 'clarion', label: '클라리온 (B4~C6)', notes: C(71, 84) },
  ],
  flute: [
    { id: 'three', label: '첫 세 음 (G·A·B)', notes: [67, 69, 71] },
    { id: 'five', label: '다섯 음 (G~D)', notes: [67, 69, 71, 72, 74] },
    { id: 'low', label: '1옥타브 (D4~D5)', notes: C(62, 74, D_MAJOR) },
    { id: 'cross', label: 'C♯↔D 넘기 (A4~A5)', notes: C(69, 81, D_MAJOR) },
    { id: 'two', label: '2옥타브 (D4~D6)', notes: C(62, 86, D_MAJOR) },
  ],
};

/** 같은 씨앗이면 같은 악구 (테스트용) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/**
 * 악구: 첫 음은 아무 음, 다음 음은 대부분 이웃 음(묶음 안에서 1~2칸), 가끔 3칸 도약.
 * 같은 음을 연달아 쓰지 않음 (따라 불 때 음이 나뉘어 들리게).
 */
export function makePhrase(pool: number[], len: number, rand: () => number): number[] {
  const out: number[] = [];
  let i = Math.floor(rand() * pool.length);
  out.push(pool[i]);
  while (out.length < len) {
    const r = rand();
    const step = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
    let dir = rand() < 0.5 ? -1 : 1;
    if (i + dir * step < 0 || i + dir * step >= pool.length) dir = -dir;
    const j = Math.max(0, Math.min(pool.length - 1, i + dir * step));
    if (j === i) continue;
    i = j;
    out.push(pool[i]);
  }
  return out;
}

export interface EchoResult { marks: ('ok' | 'wrong' | 'missing')[]; played: number[]; correct: number; perfect: boolean }

/** 들은 음(순서대로)과 비교. 같은 음이 이어서 잡히면 하나로, 앞쪽 짧은 잡음 대비로 끝에서 맞춤 */
export function scoreEcho(target: number[], played: number[]): EchoResult {
  const p: number[] = [];
  for (const m of played) if (p[p.length - 1] !== m) p.push(m);
  // 들은 음이 더 많으면, 정답과 가장 많이 겹치는 위치를 고름 (앞에 잡음·고쳐 분 음이 있을 때)
  let best = p.slice(0, target.length), bestScore = -1;
  for (let off = 0; off <= Math.max(0, p.length - target.length); off++) {
    const w = p.slice(off, off + target.length);
    const sc = w.filter((m, k) => m === target[k]).length;
    if (sc > bestScore) { bestScore = sc; best = w; }
  }
  const marks = target.map((m, k) => (best[k] === undefined ? 'missing' : best[k] === m ? 'ok' : 'wrong')) as EchoResult['marks'];
  const correct = marks.filter((x) => x === 'ok').length;
  return { marks, played: best, correct, perfect: correct === target.length };
}

/** 연속 결과로 다음 길이: 3번 연속 다 맞으면 +1 (최대 6), 2번 연속 절반 못 맞히면 −1 (최소 2) */
export function nextLength(len: number, history: boolean[], halfFails: number): number {
  const last3 = history.slice(-3);
  if (last3.length === 3 && last3.every(Boolean)) return Math.min(6, len + 1);
  if (halfFails >= 2) return Math.max(2, len - 1);
  return len;
}
