import type { ClickSound } from '../audio/metronome';
import type { Instrument } from '../audio/notes';
import { P } from '../instruments/profiles';
import type { ToleranceId } from '../score/tolerance';

export interface RoutineItem { key: string; label: string; minutes: number }

export interface Settings {
  a4: number;
  /** 악기 (이조) */
  instrument: Instrument;
  clickSound: ClickSound;
  clickVolume: number;
  wakeLock: boolean;
  minDb: number;
  bpm: number;
  meterId: string;
  subdivision: number;
  accent: boolean;
  droneVolume: number;
  routine: RoutineItem[];
  /** 연습 항목 시간이 끝나면 알림 (소리·진동·안내) */
  itemAlert: boolean;
  /** 이어폰 지연 보정 (ms) */
  latencyMs: number;
  /** 음정 판정 기준 (악보 채점 색·지금 내는 음·복습함·템포 사다리) */
  pitchTolerance: ToleranceId;
  /** 성능: 자동(메모리 4GB 이하면 가벼운 모드) / 가벼운 모드 / 보통 */
  perfMode: import('../state/lite').PerfMode;
}

export const DEFAULT_ROUTINE: RoutineItem[] = [
  { key: 'tune', label: P.routineTuneLabel, minutes: 2 },
  { key: 'longtone', label: '롱톤', minutes: 5 },
  { key: 'tongue', label: '텅잉', minutes: 3 },
  { key: 'scale', label: '음계·연습곡', minutes: 8 },
  { key: 'piece', label: '곡 연습', minutes: 10 },
  { key: 'review', label: '복습 곡', minutes: 2 },
];

export const DEFAULT_SETTINGS: Settings = {
  a4: P.defaultA4,
  instrument: P.defaultTranspose,
  clickSound: 'wood',
  clickVolume: 0.8,
  wakeLock: true,
  minDb: -50,
  bpm: 80,
  meterId: '4/4',
  subdivision: 1,
  accent: true,
  droneVolume: 0.3,
  routine: DEFAULT_ROUTINE,
  itemAlert: true,
  latencyMs: 0,
  pitchTolerance: 'normal',
  perfMode: 'auto',
};

export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
