import { INST, type InstrumentId } from './current';
import type { Instrument } from '../audio/notes';
import { FINGERINGS as CLARINET_FINGERINGS, KEY_LABEL as CLARINET_KEY_LABEL } from '../clarinet/fingerings';
import { FLUTE_FINGERINGS, FLUTE_KEY_LABEL } from '../flute/fingerings';
import clarinetTuning from '../audio/clarinetSamples.json';
import fluteTuning from '../audio/fluteSamples.json';

/** 악기마다 다른 것을 한 곳에 (운지·음역·이조·샘플·안내 문구). 연습곡은 exercise/curriculum.ts 의 curriculumFor */
export interface AnyFingering { keys: string[]; note?: string }
export interface AnyNoteFingering { midi: number; main: AnyFingering; alts: AnyFingering[]; tip?: string }

export interface Profile {
  id: InstrumentId;
  name: string;
  /** 모델 (운지·피치 기준) */
  model: string;
  title: string;
  dbName: string;
  /** 이조 설정 기본값과 고를 수 있는 값 */
  defaultTranspose: Instrument;
  transposeChoices: Instrument[];
  /** 기본 기준음 */
  defaultA4: number;
  /** 악보음 음역 */
  range: { lo: number; hi: number };
  /** 이 음(악보음 midi)부터가 "넘는" 음 위쪽 (클라리넷 브레이크 B♭4|B4, 플룻 C♯5|D5) */
  breakAt: number;
  breakName: string;
  /** "브레이크를 넘는 음" */
  breakNotes: string;
  /** 음정 그래프 안내 */
  pitchHabit: string;
  /** 연습곡 소개 */
  exerciseIntro: string;
  registerOf: (midi: number) => { id: string; label: string };
  fingerings: AnyNoteFingering[];
  keyLabel: Record<string, string>;
  /** 운지표 음역 칩 */
  fgRanges: { id: 'low' | 'mid' | 'high'; label: string; lo: number; hi: number }[];
  /** 고급 음역 안내 */
  highNote: string;
  sampleDir: string;
  sampleTuning: Record<string, [number, number]>;
  sampleName: string;
  wave: 'reed' | 'flute';
  /** 음높이 감지 범위 (실음 Hz) */
  minFreq: number;
  maxFreq: number;
  tuneNotes: { midi: number; label: string; why: string }[];
  tuneTitle: string;
  tuneSharp: string;
  tuneFlat: string;
  tuneHint: string;
  tuneTips: string[];
  routineTuneLabel: string;
  longNotes: number[];
  longDefault: number;
  longHint: string;
  tongueHint: string;
  /** 텅잉 조언의 "음이 끊기는 원인" */
  tongueExtra: string;
  drones: { id: string; label: string; rootMidi: number }[];
  droneDefault: number;
  /** 넘는 음 채점 뒤 조언 */
  breakAdvice: string;
}

export const CLARINET: Profile = {
  id: 'clarinet',
  name: '클라리넷',
  model: '뷔페 B12',
  title: '클라리넷 연습 도우미',
  dbName: 'clarinet-practice',
  defaultTranspose: 'Bb',
  transposeChoices: ['Bb', 'A', 'Eb', 'C'],
  defaultA4: 442, // 뷔페 B12 는 A=442Hz 기준 악기
  range: { lo: 52, hi: 91 },
  breakAt: 71,
  breakName: '브레이크',
  breakNotes: '브레이크를 넘는 음',
  pitchHabit: '클라리넷은 음마다 음정 버릇이 달라요. 흔히 스로트 음(G♯4~B♭4)은 높게 나오기 쉬워요. 내 악기에서 어느 음이 늘 벗어나는지 여기서 확인하세요.',
  exerciseIntro: '첫 소리(왼손 세 음)부터 쉬운 곡, 브레이크 넘기, 두 옥타브 음계·에튀드, 텅잉·슬러 연습까지 앱이 악보를 만들어 줘요.',
  registerOf: (midi) => {
    if (midi <= 66) return { id: 'chalumeau', label: '샬뤼모 (낮은 음역)' };
    if (midi <= 70) return { id: 'throat', label: '스로트 (목 음역)' };
    if (midi <= 84) return { id: 'clarion', label: '클라리온 (가운데 음역)' };
    return { id: 'altissimo', label: '알티시모 (높은 음역)' };
  },
  fingerings: CLARINET_FINGERINGS as AnyNoteFingering[],
  keyLabel: CLARINET_KEY_LABEL,
  fgRanges: [
    { id: 'low', label: '낮은 음 E3~B♭4', lo: 52, hi: 70 },
    { id: 'mid', label: '가운데 B4~C6', lo: 71, hi: 84 },
    { id: 'high', label: '높은 음 (고급)', lo: 85, hi: 91 },
  ],
  highNote: '알티시모 운지는 악기·리드마다 조금씩 달라요. 선생님과 확인하세요.',
  sampleDir: 'clarinet',
  sampleTuning: clarinetTuning as unknown as Record<string, [number, number]>,
  sampleName: '클라리넷',
  wave: 'reed',
  minFreq: 130, // 가장 낮은 실음 D3(147Hz) 아래 여유
  maxFreq: 1500, // 알티시모 실음 F6(1397Hz) 위 여유
  tuneNotes: [
    { midi: 72, label: 'C5', why: '실음 B♭4 — 관악 합주의 기준음' },
    { midi: 67, label: 'G4', why: '열린 G — 배럴(통) 길이에 민감' },
    { midi: 71, label: 'B4', why: '브레이크 넘은 첫 음 — 아래 관절 확인' },
    { midi: 62, label: 'D4', why: '샬뤼모 음역 확인' },
  ],
  tuneTitle: '배럴 조절',
  tuneSharp: '높아요. 배럴(마우스피스 아래 통)을 1mm쯤 빼 보세요.',
  tuneFlat: '낮아요. 배럴을 조금 밀어 넣어 보세요. 다 넣었는데도 낮으면 악기를 더 데우고 다시 재요.',
  tuneHint: '뷔페 B12는 A=442Hz에 맞춰 만든 악기라 앱 기준음도 442Hz로 시작해요. 합주에서 440Hz를 쓰면 아래에서 바꾸세요. 악기가 차가우면 음이 낮아요. 1~2분 불어서 데운 뒤 조율하세요. 아래 관절(B4)이 많이 다르면 위아래 관절 사이를 조금 빼요.',
  tuneTips: ['리드를 물에 살짝 적시고, 리가처 나사는 손으로 가볍게 조여요.', '리드 끝이 마우스피스 끝과 나란하게, 아주 조금만 아래로.', '악기를 1~2분 불어 데운 뒤 튜너의 "조율하기"로 C5(실음 B♭)를 맞춰요.'],
  routineTuneLabel: '조립·리드·튜닝',
  longNotes: [67, 60, 64, 57, 55, 52, 71, 72],
  longDefault: 67,
  longHint: '처음엔 열린 G(G4)나 C4처럼 편한 음으로. 숨을 크게 들이마시고, 배로 받치며 같은 속도로 내보내요. 소리가 끊기면 자동으로 끝나요.',
  tongueHint: '편한 음 하나(열린 G, C4 등)로 "투-투-투" 혀끝을 리드에 댔다 떼며 박에 맞춰 불어요. 한 마디 세는 소리 뒤에 시작해요. 숨은 끊지 말고 혀로만 음을 나눠요.',
  tongueExtra: '음이 끊어지거나 리드가 울컥거리지 않는지',
  drones: [
    { id: 'C', label: 'C장조', rootMidi: 60 },
    { id: 'F', label: 'F장조', rootMidi: 53 },
    { id: 'G', label: 'G장조', rootMidi: 55 },
    { id: 'D', label: 'D장조', rootMidi: 62 },
    { id: 'Am', label: 'A단조', rootMidi: 57 },
  ],
  droneDefault: 60,
  breakAdvice: '브레이크 위 음(B4·C5)은 낮게 나기 쉬워요. 숨을 빠르게, 입술은 그대로.',
};

export const FLUTE: Profile = {
  id: 'flute',
  name: '플룻',
  model: '야마하 YFL-222',
  title: '플룻 연습 도우미',
  dbName: 'flute-practice',
  defaultTranspose: 'C',
  transposeChoices: ['C'],
  defaultA4: 442,
  range: { lo: 60, hi: 96 },
  breakAt: 74,
  breakName: '옥타브 넘기 (C♯5↔D5)',
  breakNotes: 'C♯5↔D5를 넘는 음',
  pitchHabit: '플룻은 높은 음일수록 음정이 올라가고, 작게 불면 내려가기 쉬워요. 내 소리에서 어느 음이 늘 벗어나는지 여기서 확인하세요.',
  exerciseIntro: '첫 소리(B·A·G)부터 쉬운 곡, 하모닉스·옥타브 넘기, 두 옥타브 음계·에튀드, 텅잉·슬러 연습까지 앱이 악보를 만들어 줘요.',
  registerOf: (midi) => {
    if (midi <= 71) return { id: 'low', label: '1옥타브 (낮은 음역)' };
    if (midi <= 83) return { id: 'mid', label: '2옥타브 (가운데 음역)' };
    if (midi <= 95) return { id: 'high', label: '3옥타브 (높은 음역)' };
    return { id: 'top', label: '4옥타브' };
  },
  fingerings: FLUTE_FINGERINGS as AnyNoteFingering[],
  keyLabel: FLUTE_KEY_LABEL,
  fgRanges: [
    { id: 'low', label: '낮은 음 C4~C♯5', lo: 60, hi: 73 },
    { id: 'mid', label: '가운데 D5~C♯6', lo: 74, hi: 85 },
    { id: 'high', label: '높은 음 D6~C7', lo: 86, hi: 96 },
  ],
  highNote: '3옥타브 운지는 숨이 빠르고 가늘어야 나요. 처음엔 하모닉스 연습으로 준비하세요.',
  sampleDir: 'flute',
  sampleTuning: fluteTuning as unknown as Record<string, [number, number]>,
  sampleName: '플룻',
  wave: 'flute',
  minFreq: 220, // 가장 낮은 C4(262Hz) 아래 여유
  maxFreq: 2400, // C7(2093Hz) 위 여유
  tuneNotes: [
    { midi: 69, label: 'A4', why: '오케스트라 기준음' },
    { midi: 70, label: 'B♭4', why: '관악 합주 기준음' },
    { midi: 81, label: 'A5', why: '옥타브 위 — 입술·숨 방향 확인' },
    { midi: 62, label: 'D4', why: '낮은 음역 확인' },
  ],
  tuneTitle: '헤드조인트 조절',
  tuneSharp: '높아요. 헤드조인트를 몸통에서 1~2mm 빼 보세요.',
  tuneFlat: '낮아요. 헤드조인트를 조금 밀어 넣어 보세요. 취구를 너무 덮지 않았는지(안쪽으로 돌렸는지)도 확인해요.',
  tuneHint: '앱 기준음은 442Hz로 시작해요(합주에서 440Hz를 쓰면 아래에서 바꾸세요). 플룻은 입술로 덮는 정도와 숨 방향에 따라 음정이 많이 바뀌어요. 평소 부는 대로, 편한 세기로 재세요. 악기가 차가우면 음이 낮아요.',
  tuneTips: ['헤드조인트의 취구를 몸통 키들의 가운데 줄과 맞춰요 (사람에 따라 살짝 안쪽으로).', '헤드조인트는 끝까지 넣지 말고 조금 빼 둔 채 시작해요.', '1~2분 불어 데운 뒤 튜너의 "조율하기"로 A4를 맞춰요.'],
  routineTuneLabel: '조립·튜닝',
  longNotes: [71, 69, 67, 74, 65, 62, 79, 60],
  longDefault: 71,
  longHint: '처음엔 B4·A4·G4처럼 편한 음으로. 입술 가운데 작은 구멍으로, 취구 건너편 가장자리에 숨을 나누듯 불어요. 배로 받치며 같은 속도로. 소리가 끊기면 자동으로 끝나요.',
  tongueHint: '편한 음 하나(B4, A4 등)로 "투-투-투" 혀끝을 윗니 뒤에 댔다 떼며 박에 맞춰 불어요. 한 마디 세는 소리 뒤에 시작해요. 숨은 끊지 말고 혀로만 음을 나눠요.',
  tongueExtra: '음이 끊어지거나 옥타브 위로 튀지 않는지',
  drones: [
    { id: 'G', label: 'G장조', rootMidi: 67 },
    { id: 'C', label: 'C장조', rootMidi: 60 },
    { id: 'F', label: 'F장조', rootMidi: 65 },
    { id: 'D', label: 'D장조', rootMidi: 62 },
    { id: 'Bb', label: 'B♭장조', rootMidi: 70 },
  ],
  droneDefault: 67,
  breakAdvice: 'C♯5 ↔ D5는 손가락이 거의 다 바뀌어요. 손가락을 한꺼번에 움직이고, 숨 방향은 그대로 두세요.',
};

export const PROFILES: Record<InstrumentId, Profile> = { clarinet: CLARINET, flute: FLUTE };
/** 지금 악기 */
export const P: Profile = PROFILES[INST];
export const fingeringFor = (midi: number, p: Profile = P) => p.fingerings.find((n) => n.midi === midi);
export const describeKeys = (keys: string[], p: Profile = P) => (keys.length === 0 ? '아무것도 누르지 않아요 (열린 음).' : keys.map((k) => p.keyLabel[k] ?? k).join(' · '));
