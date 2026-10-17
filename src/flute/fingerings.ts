/**
 * 야마하 YFL-222 플룻 운지표 (C조, 이조 없음). midi = 실음 = 악보음.
 * YFL-222: 커버드 키(구멍 없는 키), 오프셋 G, C 풋조인트, 스플릿 E 없음.
 * 운지 자료: 일반적인 뵘식 플룻 운지표 (@pepperhorn/fingering-components 0.2.2 의 flute.json, MIT 를 참고).
 * C 풋이라 가장 낮은 음은 C4. 스플릿 E 가 없어서 높은 E6 는 기본 운지로 (조금 불안정할 수 있음).
 */
export type FluteKey =
  | 'thumbB' | 'thumbBb'
  | 'l1' | 'l2' | 'l3' | 'gs'
  | 'r1' | 'r2' | 'r3'
  | 'trD' | 'trDs'
  | 'eb' | 'cs' | 'c';

export const FLUTE_KEY_LABEL: Record<FluteKey, string> = {
  thumbB: '왼손 엄지 B 키',
  thumbBb: '왼손 엄지 B♭ 키 (엄지 위쪽)',
  l1: '왼손 1 (검지)',
  l2: '왼손 2 (중지)',
  l3: '왼손 3 (약지, 오프셋 G)',
  gs: '왼손 새끼 G♯ 키',
  r1: '오른손 1 (검지)',
  r2: '오른손 2 (중지)',
  r3: '오른손 3 (약지)',
  trD: 'D 트릴 키 (오른손 검지 옆)',
  trDs: 'D♯ 트릴 키 (오른손 중지 옆)',
  eb: '오른손 새끼 E♭ 키',
  cs: '오른손 새끼 C♯ 롤러',
  c: '오른손 새끼 C 롤러',
};

export interface FluteFingering { keys: FluteKey[]; note?: string }
export interface FluteNoteFingering { midi: number; main: FluteFingering; alts: FluteFingering[]; tip?: string }

const f = (keys: FluteKey[], note?: string): FluteFingering => ({ keys, note });
const LOW: FluteKey[] = ['thumbB', 'l1', 'l2', 'l3', 'r1', 'r2', 'r3'];

/** 1옥타브 E4~C♯5 운지 (2옥타브 E5~C♯6 은 같은 운지로 숨만 빠르게) */
const FIRST: { midi: number; main: FluteFingering; alts: FluteFingering[]; tip?: string; tip2?: string }[] = [
  { midi: 64, main: f(['thumbB', 'l1', 'l2', 'l3', 'r1', 'r2', 'eb']), alts: [] },
  { midi: 65, main: f(['thumbB', 'l1', 'l2', 'l3', 'r1', 'eb']), alts: [] },
  { midi: 66, main: f(['thumbB', 'l1', 'l2', 'l3', 'r3', 'eb']), alts: [f(['thumbB', 'l1', 'l2', 'l3', 'r2', 'eb'], '오른손 중지로 (빠른 곳에서)')], tip: '오른손 약지 하나만. 검지와 중지는 들어요.' },
  { midi: 67, main: f(['thumbB', 'l1', 'l2', 'l3', 'eb']), alts: [], tip: '왼손 세 손가락 + 엄지. 오른손 새끼로 E♭ 키는 계속 눌러 둬요.' },
  { midi: 68, main: f(['thumbB', 'l1', 'l2', 'l3', 'gs', 'eb']), alts: [], tip: 'G에 왼손 새끼로 G♯ 키를 더해요.' },
  { midi: 69, main: f(['thumbB', 'l1', 'l2', 'eb']), alts: [] },
  { midi: 70, main: f(['thumbB', 'l1', 'r1', 'eb']), alts: [f(['thumbBb', 'l1', 'eb'], '엄지 B♭ 키로 (플랫 조성에서)')], tip: '"1 대 1" 운지: 왼손 검지 + 오른손 검지.' },
  { midi: 71, main: f(['thumbB', 'l1', 'eb']), alts: [], tip: '왼손 엄지와 검지만. 처음 배우는 음으로 좋아요.' },
  { midi: 72, main: f(['l1', 'eb']), alts: [], tip: '엄지를 떼고 왼손 검지만. 플룻은 오른손 엄지·왼손 검지 아래·오른손 새끼 세 곳으로 받쳐요.' },
  { midi: 73, main: f(['eb']), alts: [], tip: '거의 모두 떼요. 소리가 불안하면 숨 방향을 조금 아래로.' },
];

const NOTES: FluteNoteFingering[] = [
  { midi: 60, main: f([...LOW, 'c', 'cs']), alts: [], tip: '가장 낮은 음. 오른손 새끼로 C 롤러를 눌러요 (C♯ 롤러도 같이 닫혀요). 숨은 느리고 넓게, 입술 구멍을 조금 더 덮어요.' },
  { midi: 61, main: f([...LOW, 'cs']), alts: [] },
  { midi: 62, main: f([...LOW]), alts: [], tip: '모두 막고 오른손 새끼는 떼요 (E♭ 키를 누르지 않는 몇 안 되는 음).' },
  { midi: 63, main: f([...LOW, 'eb']), alts: [] },
  ...FIRST,
  { midi: 74, main: f(['thumbB', 'l2', 'l3', 'r1', 'r2', 'r3']), alts: [], tip: '낮은 D에서 왼손 검지만 들어요. 오른손 새끼(E♭ 키)도 떼요.' },
  { midi: 75, main: f(['thumbB', 'l2', 'l3', 'r1', 'r2', 'r3', 'eb']), alts: [], tip: '2옥타브 D에 E♭ 키. 왼손 검지는 들어요.' },
  ...FIRST.map((n) => ({ midi: n.midi + 12, main: n.main, alts: n.alts, tip: n.midi === 64 ? '낮은 E와 같은 운지. 숨을 더 빠르게, 입술 구멍을 조금 작게 해서 옥타브 위를 내요.' : n.midi === 71 ? '낮은 B와 같은 운지, 숨만 빠르게.' : undefined })),
  { midi: 86, main: f(['thumbB', 'l2', 'l3', 'eb']), alts: [], tip: '3옥타브부터는 운지가 새로워요. 숨은 빠르고 가늘게.' },
  { midi: 87, main: f(['thumbB', 'l1', 'l2', 'l3', 'gs', 'r1', 'r2', 'r3', 'eb']), alts: [] },
  { midi: 88, main: f(['thumbB', 'l1', 'l2', 'r1', 'r2', 'eb']), alts: [], tip: 'YFL-222는 스플릿 E 장치가 없어서 이 음이 조금 불안할 수 있어요. 숨을 충분히 받쳐요.' },
  { midi: 89, main: f(['thumbB', 'l1', 'l3', 'r1', 'eb']), alts: [] },
  { midi: 90, main: f(['thumbB', 'l1', 'l3', 'r3', 'eb']), alts: [f(['thumbB', 'l1', 'l3', 'r3', 'cs'])] },
  { midi: 91, main: f(['l1', 'l2', 'l3', 'eb']), alts: [] },
  { midi: 92, main: f(['l2', 'l3', 'gs', 'eb']), alts: [f(['l2', 'l3', 'gs', 'r2', 'r3', 'eb'])] },
  { midi: 93, main: f(['thumbB', 'l2', 'r1', 'eb']), alts: [f(['thumbB', 'l2', 'r1', 'cs'])] },
  { midi: 94, main: f(['thumbB', 'r1', 'trD']), alts: [f(['thumbBb', 'l1', 'l3', 'trD', 'r3'])] },
  { midi: 95, main: f(['thumbB', 'l1', 'l3', 'trDs']), alts: [f(['thumbB', 'l1', 'l3', 'trD', 'trDs', 'r3', 'eb'])] },
  { midi: 96, main: f(['l1', 'l2', 'l3', 'gs', 'r1']), alts: [f(['l1', 'l2', 'l3', 'gs', 'r1', 'r2', 'trDs'])] },
];

export const FLUTE_FINGERINGS: FluteNoteFingering[] = NOTES.sort((a, b) => a.midi - b.midi);
