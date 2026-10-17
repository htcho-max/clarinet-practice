import { resumeAudio } from './context';
import { waveFor } from './timbre';
import { toSounding } from './notes';

/** freq 는 악보음 주파수 (실음으로 바꿔서 냄) */
export interface DroneVoice { freq: number; gain: number }

/** 지속음. 으뜸음 + (선택) 순정 5도 */
export class Drone {
  private nodes: { osc: OscillatorNode; g: GainNode }[] = [];
  private master: GainNode | null = null;
  volume = 0.3;

  get playing() { return this.nodes.length > 0; }

  async start(voices: DroneVoice[]) {
    const ctx = await resumeAudio();
    this.stop(0.05);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(master).connect(ctx.destination);
    const wave = waveFor(ctx);
    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = toSounding(v.freq);
      const g = ctx.createGain();
      g.gain.value = v.gain;
      osc.connect(g).connect(lp);
      osc.start();
      this.nodes.push({ osc, g });
    }
    this.master = master;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) {
      const ctx = this.master.context;
      this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  stop(fade = 0.4) {
    if (!this.master) return;
    const ctx = this.master.context;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + fade);
    this.nodes.forEach(({ osc }) => osc.stop(now + fade + 0.05));
    this.nodes = [];
    this.master = null;
  }
}

export const drone = new Drone();

