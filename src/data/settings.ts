import type { ClickSound } from '../audio/metronome';
import type { Instrument } from '../audio/notes';

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
}

export const DEFAULT_ROUTINE: RoutineItem[] = [
  { key: 'tune', label: '조립·리드·튜닝', minutes: 2 },
  { key: 'longtone', label: '롱톤', minutes: 5 },
  { key: 'tongue', label: '텅잉', minutes: 3 },
  { key: 'scale', label: '음계·연습곡', minutes: 8 },
  { key: 'piece', label: '곡 연습', minutes: 10 },
  { key: 'review', label: '복습 곡', minutes: 2 },
];

export const DEFAULT_SETTINGS: Settings = {
  a4: 440,
  instrument: 'Bb',
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
};

export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
