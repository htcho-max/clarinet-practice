import { P } from '../instruments/profiles';

/** 클라리넷과 비슷한 음색: 홀수 배음이 강하고 짝수 배음은 약함 (원통관) */
export function reedWave(ctx: BaseAudioContext): PeriodicWave {
  const amps = [0, 1, 0.08, 0.55, 0.05, 0.32, 0.04, 0.2, 0.03, 0.12, 0.02, 0.07, 0.01, 0.04, 0, 0.02];
  return ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
}
/** 플룻과 비슷한 음색: 기음이 강하고 배음은 조금 */
export function fluteWave(ctx: BaseAudioContext): PeriodicWave {
  const amps = [0, 1, 0.22, 0.09, 0.05, 0.02, 0.01];
  return ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
}
/** 지금 악기의 합성 음색 */
export const waveFor = (ctx: BaseAudioContext) => (P.wave === 'flute' ? fluteWave(ctx) : reedWave(ctx));
