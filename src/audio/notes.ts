export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTE_NAMES_KO: Record<string, string> = {
  C: '도', 'C#': '도#', D: '레', 'D#': '레#', E: '미', F: '파', 'F#': '파#', G: '솔', 'G#': '솔#', A: '라', 'A#': '라#', B: '시',
};

/**
 * 이조 악기: 앱 안의 음 이름·채점은 모두 "악보음"(written)으로 다룹니다.
 * 마이크로 들은 실음(sounding) 주파수에 반음 transpose 만큼 곱해서 악보음으로 바꾸고,
 * 앱이 내는 소리(기준음·드론·악보 듣기)는 반대로 실음으로 바꿔서 냅니다.
 * B♭ 클라리넷 = +2 (악보 C → 실음 B♭), A 클라리넷 = +3, E♭ 클라리넷 = -3, C(실음) = 0
 */
export type Instrument = 'Bb' | 'A' | 'Eb' | 'C';
export const INSTRUMENTS: { id: Instrument; label: string; semis: number }[] = [
  { id: 'Bb', label: 'B♭ 클라리넷', semis: 2 },
  { id: 'A', label: 'A 클라리넷', semis: 3 },
  { id: 'Eb', label: 'E♭ 클라리넷', semis: -3 },
  { id: 'C', label: '실음 (이조 안 함)', semis: 0 },
];
let transposeSemis = 2;
export function setTranspose(semis: number) { transposeSemis = semis; }
export function getTranspose() { return transposeSemis; }
export const instrumentSemis = (id: Instrument) => INSTRUMENTS.find((i) => i.id === id)?.semis ?? 2;
/** 실음 주파수 → 악보음 주파수 */
export const toWritten = (freq: number) => freq * Math.pow(2, transposeSemis / 12);
/** 악보음 주파수 → 실음 주파수 */
export const toSounding = (freq: number) => freq * Math.pow(2, -transposeSemis / 12);
/** 악보음 midi → 실음 midi */
export const soundingMidi = (writtenMidi: number) => writtenMidi - transposeSemis;

/** 클라리넷 음역 이름 (악보음 기준) */
export function registerOf(midi: number): { id: 'chalumeau' | 'throat' | 'clarion' | 'altissimo'; label: string } {
  if (midi <= 66) return { id: 'chalumeau', label: '샬뤼모 (낮은 음역)' };
  if (midi <= 70) return { id: 'throat', label: '스로트 (목 음역)' };
  if (midi <= 84) return { id: 'clarion', label: '클라리온 (가운데 음역)' };
  return { id: 'altissimo', label: '알티시모 (높은 음역)' };
}
/** 클라리넷 악보음 음역: E3 ~ C6 (입문은 G6 까지 안 씀) */
export const CLARINET_LOW = 52;
export const CLARINET_HIGH = 93;

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

export interface NoteInfo { midi: number; name: string; octave: number; cents: number }

export function freqToNote(freq: number, a4 = 440): NoteInfo {
  const m = freqToMidiFloat(freq, a4);
  const midi = Math.round(m);
  const cents = (m - midi) * 100;
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents };
}

export function midiName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
/** 플랫으로 읽는 이름 (B♭4 등). 클라리넷 교재는 B♭·E♭을 많이 씀 */
const FLAT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
export function prettyName(midi: number): string {
  return `${FLAT_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** 드론(으뜸음) 기준 순정률 비율. 반음 수 0~11 */
export const JUST_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
export function intervalName(semis: number, octave: number): string {
  if (semis === 0) return octave === 0 ? '같은 음' : '옥타브';
  return INTERVAL_NAMES[semis];
}
export const INTERVAL_NAMES = ['1도', '단2도', '장2도', '단3도', '장3도', '완전4도', '증4도', '완전5도', '단6도', '장6도', '단7도', '장7도'];

/** 으뜸음 기준 순정 음정과의 센트 차이 */
export function justCents(freq: number, rootFreq: number): { semis: number; octave: number; cents: number } {
  const fromRoot = 1200 * Math.log2(freq / rootFreq); // 센트
  const steps = Math.round(fromRoot / 100);
  const octave = Math.floor(steps / 12);
  const semis = ((steps % 12) + 12) % 12;
  const target = rootFreq * Math.pow(2, octave) * JUST_RATIOS[semis];
  return { semis, octave, cents: 1200 * Math.log2(freq / target) };
}
