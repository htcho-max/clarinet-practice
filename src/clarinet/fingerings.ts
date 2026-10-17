/**
 * B♭ 클라리넷 (17키 6링 뵘식) 운지표. 모두 악보음(written) 기준 midi.
 * 운지 자료: 일반적인 제조사 운지표 (@pepperhorn/fingering-components 0.2.2 의 clarinet.json, MIT 를 참고해
 * 입문자용으로 새끼손가락 키를 정리함 — 낮은 E·B 는 왼손, F·C 는 오른손, F♯·C♯ 는 왼손, G♯·D♯ 은 오른손).
 */

export type KeyId =
  | 'reg' | 'thumb'
  | 'a' | 'gs'
  | 'l1' | 'l2' | 'l3'
  | 'lEbSide' | 'csgs'
  | 'lFC' | 'lEB' | 'lFs'
  | 't1' | 't2' | 't3' | 't4'
  | 'r1' | 'r2' | 'r3'
  | 'sliver'
  | 'rAb' | 'rFs' | 'rFC' | 'rEB';

export const KEY_LABEL: Record<KeyId, string> = {
  reg: '레지스터 키 (왼손 엄지)',
  thumb: '엄지 구멍',
  a: 'A 키 (왼손 검지)',
  gs: 'G♯ 키 (왼손 검지)',
  l1: '왼손 1 (검지)',
  l2: '왼손 2 (중지)',
  l3: '왼손 3 (약지)',
  lEbSide: '왼손 옆 E♭/B♭ 키',
  csgs: 'C♯/G♯ 키',
  lFC: '왼손 새끼 F/C',
  lEB: '왼손 새끼 E/B',
  lFs: '왼손 새끼 F♯/C♯',
  t1: '옆 트릴 키 1 (맨 위)',
  t2: '옆 트릴 키 2',
  t3: '옆 트릴 키 3',
  t4: '옆 트릴 키 4 (맨 아래)',
  r1: '오른손 1 (검지)',
  r2: '오른손 2 (중지)',
  r3: '오른손 3 (약지)',
  sliver: '오른손 옆 E♭/B♭ 키 (슬리버)',
  rAb: '오른손 새끼 A♭/E♭',
  rFs: '오른손 새끼 F♯/C♯',
  rFC: '오른손 새끼 F/C',
  rEB: '오른손 새끼 E/B',
};

export interface Fingering { keys: KeyId[]; note?: string }
export interface NoteFingering { midi: number; main: Fingering; alts: Fingering[]; tip?: string }

const LOW: KeyId[] = ['thumb', 'l1', 'l2', 'l3', 'r1', 'r2', 'r3'];
const LH: KeyId[] = ['thumb', 'l1', 'l2', 'l3'];
const R = (...k: KeyId[]): KeyId[] => ['reg', ...k];
const f = (keys: KeyId[], note?: string): Fingering => ({ keys, note });

/** 아래 음역 (샬뤼모) E3~F♯4: 레지스터 키를 더하면 12도(19반음) 위 클라리온 음 */
const CHALUMEAU: { midi: number; main: Fingering; alts: Fingering[]; tip?: string }[] = [
  { midi: 52, main: f([...LOW, 'lEB']), alts: [f([...LOW, 'rEB'], '오른손 새끼로')], tip: '가장 낮은 음. 모든 구멍을 손가락 바닥(지문 부분)으로 빈틈없이 막아야 나요.' },
  { midi: 53, main: f([...LOW, 'rFC']), alts: [f([...LOW, 'lFC'], '왼손 새끼로')] },
  { midi: 54, main: f([...LOW, 'lFs']), alts: [f([...LOW, 'rFs'], '오른손 새끼로')] },
  { midi: 55, main: f([...LOW]), alts: [], tip: '엄지와 여섯 손가락을 모두 막아요. 새끼손가락 키는 누르지 않아요.' },
  { midi: 56, main: f([...LOW, 'rAb']), alts: [] },
  { midi: 57, main: f([...LH, 'r1', 'r2']), alts: [] },
  { midi: 58, main: f([...LH, 'r1']), alts: [] },
  { midi: 59, main: f([...LH, 'r2']), alts: [f([...LH, 'r1', 'sliver'], '옆 키로')], tip: '오른손 중지 하나만 막는 "갈래 운지"예요.' },
  { midi: 60, main: f([...LH]), alts: [], tip: '왼손만 모두 막아요. 오른손은 키 위에 가볍게 올려 둬요.' },
  { midi: 61, main: f([...LH, 'csgs']), alts: [] },
  { midi: 62, main: f(['thumb', 'l1', 'l2']), alts: [] },
  { midi: 63, main: f(['thumb', 'l1', 'l2', 't4']), alts: [f(['thumb', 'l1', 'l2', 'lEbSide'], '왼손 옆 키로')] },
  { midi: 64, main: f(['thumb', 'l1']), alts: [] },
  { midi: 65, main: f(['thumb']), alts: [] },
  { midi: 66, main: f(['l1']), alts: [f(['thumb', 't3', 't4'], '트릴 키로')], tip: '엄지를 떼고 왼손 검지만.' },
];

const NOTES: NoteFingering[] = [
  ...CHALUMEAU,
  // 스로트 음역: 레지스터 없이 왼손 위쪽 키
  { midi: 67, main: f([]), alts: [], tip: '"열린 G". 아무것도 막지 않아요. 오른손 엄지로 악기를 받치고, 손가락은 구멍 바로 위에 둬요.' },
  { midi: 68, main: f(['gs']), alts: [], tip: '왼손 검지 옆면으로 G♯ 키를 눌러요.' },
  { midi: 69, main: f(['a']), alts: [], tip: '왼손 검지를 살짝 올려 A 키를 눌러요. 손가락을 들어 올리지 말고 굴리듯이.' },
  { midi: 70, main: f(['a', 'reg']), alts: [f(['a', 't4'], '트릴 키로 (음색이 더 좋을 때가 많아요)')], tip: 'A 키와 레지스터 키를 같이. 소리가 얇으면 오른손을 내려 두어도 돼요.' },
  // 클라리온: 샬뤼모 운지 + 레지스터 키
  ...CHALUMEAU.filter((n) => n.midi <= 65).map((n) => ({
    midi: n.midi + 19,
    main: f(R(...n.main.keys)),
    alts: n.alts.map((a) => f(R(...a.keys), a.note)),
    tip: n.midi === 52 ? '브레이크를 넘은 첫 음. 낮은 E 운지에 레지스터 키만 더해요. 손가락이 조금이라도 새면 안 나요.'
      : n.midi === 55 ? '낮은 G(모두 막기) + 레지스터 키.'
        : n.midi === 60 ? '왼손 모두 + 레지스터 키. 오선 바로 위의 G예요.'
          : n.midi === 65 ? '엄지 + 레지스터만. 클라리온 음역의 가장 높은 음이에요.' : undefined,
  })),
  // 알티시모 (참고용)
  { midi: 85, main: f(R('thumb', 'l2', 'l3', 'r1', 'r2')), alts: [f(R('thumb', 't3', 't4'))] },
  { midi: 86, main: f(R('thumb', 'l2', 'l3', 'r1', 'rAb')), alts: [f(R('thumb', 't4'))] },
  { midi: 87, main: f(R('thumb', 'l2', 'l3', 'r1', 'sliver', 'rAb')), alts: [f(R('thumb', 'l2', 'l3', 'r2', 'rAb'))] },
  { midi: 88, main: f(R('thumb', 'l2', 'l3', 'rAb')), alts: [] },
  { midi: 89, main: f(R('thumb', 'l2', 'l3', 'csgs', 'rAb')), alts: [f(R('thumb', 'l1', 'l2', 'l3', 'csgs', 'r1', 'r2', 'r3'))] },
  { midi: 90, main: f(R('thumb', 'l2', 'rAb')), alts: [f(R('thumb', 'l1', 'l2', 'l3', 'r1', 'r2', 'r3', 'rAb'))] },
  { midi: 91, main: f(R('thumb', 'l2', 'r1', 'r2', 'rAb')), alts: [f(R('l2', 'l3', 'r1', 'rAb'))] },
];

export const FINGERINGS: NoteFingering[] = NOTES.sort((a, b) => a.midi - b.midi);
const BY_MIDI = new Map(FINGERINGS.map((n) => [n.midi, n]));
export const fingeringFor = (midi: number): NoteFingering | undefined => BY_MIDI.get(midi);

/** 브레이크: A♯4(70) 이하 ↔ B4(71) 이상 사이 */
export const crossesBreak = (a: number, b: number) => (a <= 70 && b >= 71) || (a >= 71 && b <= 70);

/** 두 운지에서 움직이는 손가락(키) 수 — 넘기 어려운 정도 */
export function keyChanges(a: number, b: number): number {
  const fa = fingeringFor(a)?.main.keys ?? [], fb = fingeringFor(b)?.main.keys ?? [];
  const A = new Set(fa), B = new Set(fb);
  return [...A].filter((k) => !B.has(k)).length + [...B].filter((k) => !A.has(k)).length;
}

/** 오른손을 내려 둔 채 스로트 음(G4~B♭4)을 낼 수 있게 (브레이크 넘기 팁) */
export const RIGHT_HAND_DOWN_TIP = '스로트 음(G·G♯·A·B♭)에서 오른손을 미리 내려 두면 브레이크를 넘을 때 움직이는 손가락이 줄어요.';

/** 운지에 쓰는 손 요약 (키 목록을 사람이 읽기 쉬운 문장으로) */
export function describeKeys(keys: KeyId[]): string {
  if (keys.length === 0) return '아무것도 누르지 않아요 (열린 음).';
  return keys.map((k) => KEY_LABEL[k]).join(' · ');
}
