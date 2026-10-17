/** 클라리넷과 비슷한 음색: 홀수 배음이 강하고 짝수 배음은 약함 (원통관) */
export function reedWave(ctx: BaseAudioContext): PeriodicWave {
  const amps = [0, 1, 0.08, 0.55, 0.05, 0.32, 0.04, 0.2, 0.03, 0.12, 0.02, 0.07, 0.01, 0.04, 0, 0.02];
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps);
  return ctx.createPeriodicWave(real, imag);
}
