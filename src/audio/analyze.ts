import { PitchDetector } from 'pitchy';
import { rmsDb } from './smoothing';
import { P } from '../instruments/profiles';


/** 악기 음역에 맞춘 감지 범위 (실음 Hz) */
export const MIN_FREQ = P.minFreq;
export const MAX_FREQ = P.maxFreq;
export const MIN_CLARITY = 0.9;

export interface FrameResult { freq: number | null; clarity: number; db: number }

/** 한 프레임 분석: 소리가 작거나, 신뢰도가 낮거나, 범위 밖이면 freq = null */
export function analyzeFrame(
  detector: PitchDetector<Float32Array>,
  buf: Float32Array,
  sampleRate: number,
  minDb: number,
): FrameResult {
  const db = rmsDb(buf);
  if (db < minDb) return { freq: null, clarity: 0, db };
  const [freq, clarity] = detector.findPitch(buf, sampleRate);
  if (clarity < MIN_CLARITY || freq < MIN_FREQ || freq > MAX_FREQ) return { freq: null, clarity, db };
  return { freq, clarity, db };
}
