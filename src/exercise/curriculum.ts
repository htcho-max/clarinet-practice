import { keyById, type Key } from './theory';
import { scale, arpeggio, thirds, seq4, chromatic, twelfths, breakDrill, etude, autoRange, type Phrase, type RangeOptions } from './patterns';
import { artBase, variantById, ART_BASES, type ArtBaseId } from './articulation';
import { build, type Bowing, type Built } from './build';
import { songById, buildSong } from './songs';

export type PatternId = 'art' | 'song' | 'scale' | 'arpeggio' | 'thirds' | 'seq4' | 'chromatic' | 'twelfths' | 'breakDrill' | 'etude';
/** 음역 (악보음): 낮은 음역(레지스터 키 없이) / 브레이크 조금 넘어 / 클라리온 C6 까지 */
export type RangeSet = 'low' | 'cross' | 'full';
export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'scale', label: '음계' },
  { id: 'arpeggio', label: '분산화음' },
  { id: 'thirds', label: '3도' },
  { id: 'seq4', label: '4음 시퀀스' },
  { id: 'chromatic', label: '반음계' },
  { id: 'etude', label: '에튀드' },
];
export const RANGE_SETS: { id: RangeSet; label: string; r: RangeOptions }[] = [
  { id: 'low', label: '낮은 음역 (E3~B♭4)', r: { lo: 52, hi: 70 } },
  { id: 'cross', label: '브레이크 넘어 (E3~F5)', r: { lo: 52, hi: 77 } },
  { id: 'full', label: '클라리온까지 (E3~C6)', r: { lo: 52, hi: 84 } },
];
export const rangeOf = (id: RangeSet) => RANGE_SETS.find((x) => x.id === id)!.r;

export interface ExerciseSpec {
  key: string;
  pattern: PatternId;
  /** 예전 이름 유지 (DB 에 저장된 값): 음역 */
  positions: RangeSet;
  octaves?: number;
  perBeat?: number; // 단계가 정한 리듬 (없으면 사용자 선택)
  bowing?: Bowing; // 단계가 정한 아티큘레이션
  base?: ArtBaseId; // 아티큘레이션 연습 기본 악구
  variant?: string; // 아티큘레이션 변형 번호
  song?: string; // 쉬운 곡·첫 소리 연습
  /** 이 음(악보음 midi) 위의 으뜸음에서 시작 */
  lo?: number;
}
export interface Step { id: string; stage: string; title: string; tip: string; spec: ExerciseSpec; tempo: number }

export const STAGES = [
  { id: 'A', title: '1단계 · 첫 소리', desc: '왼손 → 스로트 → 오른손 → 새끼손가락 순서로 낮은 음역의 음을 하나씩 익혀요. 긴 음과 쉼표(숨 쉬기)가 많아요.' },
  { id: 'B', title: '2단계 · 쉬운 곡', desc: '레지스터 키 없이 부는 낮은 음역의 노래들. 박자와 텅잉을 같이 익혀요.' },
  { id: 'C', title: '3단계 · 낮은 음역 음계', desc: '레지스터 키 없이 낼 수 있는 음계와 반음계. 손가락을 고르게 움직이는 연습.' },
  { id: 'D', title: '4단계 · 브레이크 넘기', desc: '레지스터 키로 12도 올리기, 스로트 음 ↔ 클라리온 음 넘기. 넘는 음은 채점 뒤에 따로 보여줘요.' },
  { id: 'E', title: '5단계 · 클라리온 음계·에튀드', desc: '두 옥타브 음계와 분산화음, 에튀드. "다른 곡 만들기"로 매번 새 에튀드를 만들 수 있어요.' },
];

const T = (perBeat: number, bowing: Bowing = 'detache') => ({ perBeat, bowing });
export const STEPS: Step[] = [
  { id: 'A1', stage: 'A', title: '왼손 세 음 · E4 F4 G4', tip: songById('a-left3')!.tip, spec: { key: 'C', pattern: 'song', positions: 'low', song: 'a-left3' }, tempo: 60 },
  { id: 'A2', stage: 'A', title: '왼손 다섯 음 · C4~G4', tip: songById('a-left5')!.tip, spec: { key: 'C', pattern: 'song', positions: 'low', song: 'a-left5' }, tempo: 60 },
  { id: 'A3', stage: 'A', title: '스로트 음 · G4~B♭4', tip: songById('a-throat')!.tip, spec: { key: 'C', pattern: 'song', positions: 'low', song: 'a-throat' }, tempo: 60 },
  { id: 'A4', stage: 'A', title: '오른손 더하기 · G3~C4', tip: songById('a-right')!.tip, spec: { key: 'C', pattern: 'song', positions: 'low', song: 'a-right' }, tempo: 60 },
  { id: 'A5', stage: 'A', title: '새끼손가락 키 · E3~A3', tip: songById('a-pinky')!.tip, spec: { key: 'C', pattern: 'song', positions: 'low', song: 'a-pinky' }, tempo: 56 },
  ...['hotcross', 'mary', 'twinkle', 'butterfly', 'ode', 'jingle', 'moon'].map((id, i): Step => {
    const s = songById(id)!;
    return { id: `B${i + 1}`, stage: 'B', title: s.title, tip: s.tip, spec: { key: s.key, pattern: 'song', positions: 'low', song: id }, tempo: s.tempo };
  }),
  { id: 'C1', stage: 'C', title: 'F장조 음계 F3~F4', tip: 'B♭3는 오른손 검지 하나. F3는 오른손 새끼 F 키.', spec: { key: 'F', pattern: 'scale', positions: 'low', octaves: 1, ...T(1) }, tempo: 60 },
  { id: 'C2', stage: 'C', title: 'G장조 음계 G3~G4', tip: 'F♯4는 엄지를 떼고 왼손 검지만.', spec: { key: 'G', pattern: 'scale', positions: 'low', octaves: 1, ...T(1) }, tempo: 60 },
  { id: 'C3', stage: 'C', title: 'F장조 분산화음 F3~A4', tip: 'F3 → A3 → C4: 오른손을 차례로 떼요.', spec: { key: 'F', pattern: 'arpeggio', positions: 'low', octaves: 2, ...T(1) }, tempo: 60 },
  { id: 'C4', stage: 'C', title: 'G장조 음계 · 8분음표 2음 슬러', tip: '슬러 둘째 음은 혀를 쓰지 않아요. 손가락을 동시에.', spec: { key: 'G', pattern: 'scale', positions: 'low', octaves: 1, ...T(2, 'slur2') }, tempo: 60 },
  { id: 'C5', stage: 'C', title: '반음계 E3~B♭4', tip: '운지 탭에서 모르는 음을 확인하면서. 아주 느리게.', spec: { key: 'C', pattern: 'chromatic', positions: 'low', ...T(1) }, tempo: 52 },
  { id: 'D1', stage: 'D', title: '12도 올리기 (레지스터 키)', tip: '손가락은 그대로 두고 왼손 엄지로 레지스터 키만 눌러요. 위 음이 안 나면 입술을 조이지 말고 숨을 더 빠르게.', spec: { key: 'C', pattern: 'twelfths', positions: 'full', ...T(1, 'slur2Beats') }, tempo: 56 },
  { id: 'D2', stage: 'D', title: '브레이크 넘기 2음', tip: '스로트 음을 불 때 오른손을 미리 내려 두면 움직이는 손가락이 줄어요. 두 음씩 슬러로.', spec: { key: 'C', pattern: 'breakDrill', positions: 'cross', ...T(1, 'slur2Beats') }, tempo: 56 },
  { id: 'D3', stage: 'D', title: '환희의 송가 · G장조', tip: songById('ode-g')!.tip, spec: { key: 'G', pattern: 'song', positions: 'cross', song: 'ode-g' }, tempo: 72 },
  { id: 'D4', stage: 'D', title: '반짝반짝 작은 별 · G장조', tip: songById('twinkle-g')!.tip, spec: { key: 'G', pattern: 'song', positions: 'cross', song: 'twinkle-g' }, tempo: 72 },
  { id: 'D5', stage: 'D', title: 'C장조 음계 C4~C5', tip: 'A4 → B4가 브레이크. B4는 낮은 E 운지 + 레지스터 키예요.', spec: { key: 'C', pattern: 'scale', positions: 'cross', octaves: 1, ...T(1) }, tempo: 56 },
  { id: 'D6', stage: 'D', title: 'F장조 음계 F4~F5', tip: 'B♭4 → C5. B♭4도 오른손을 내려 둔 채 불어 보세요.', spec: { key: 'F', pattern: 'scale', positions: 'cross', octaves: 1, lo: 65, ...T(1) }, tempo: 56 },
  { id: 'E1', stage: 'E', title: 'G장조 2옥타브 음계', tip: '브레이크 위아래 음색이 같도록 숨을 고르게.', spec: { key: 'G', pattern: 'scale', positions: 'full', octaves: 2, ...T(2) }, tempo: 60 },
  { id: 'E2', stage: 'E', title: 'F장조 2옥타브 음계', tip: 'F5는 왼손 모두 + 오른손 검지 + 레지스터.', spec: { key: 'F', pattern: 'scale', positions: 'full', octaves: 2, ...T(2) }, tempo: 60 },
  { id: 'E3', stage: 'E', title: 'C장조 2옥타브 음계', tip: 'C6은 엄지 + 레지스터만. 입술을 조이지 말고 숨을 빠르게.', spec: { key: 'C', pattern: 'scale', positions: 'full', octaves: 2, ...T(2) }, tempo: 56 },
  { id: 'E4', stage: 'E', title: 'G장조 분산화음 2옥타브', tip: '음이 뛸 때도 숨 속도를 유지해요.', spec: { key: 'G', pattern: 'arpeggio', positions: 'full', octaves: 2, ...T(2) }, tempo: 56 },
  { id: 'E5', stage: 'E', title: 'C장조 3도', tip: '브레이크를 오가는 3도(A4–C5, G4–B4)를 특히 천천히.', spec: { key: 'C', pattern: 'thirds', positions: 'cross', octaves: 1, ...T(2) }, tempo: 56 },
  { id: 'E6', stage: 'E', title: 'C장조 에튀드 · 낮은 음역', tip: '첫 4마디와 뒤 4마디의 음형이 달라요.', spec: { key: 'C', pattern: 'etude', positions: 'low' }, tempo: 60 },
  { id: 'E7', stage: 'E', title: 'F장조 에튀드 · 브레이크 넘어', tip: '5~6마디가 높은 음역이라 브레이크를 넘어가요.', spec: { key: 'F', pattern: 'etude', positions: 'cross' }, tempo: 56 },
  { id: 'E8', stage: 'E', title: 'G장조 에튀드 · 클라리온', tip: '높은 음에서 소리가 얇아지지 않게 숨을 받쳐요.', spec: { key: 'G', pattern: 'etude', positions: 'full' }, tempo: 56 },
  { id: 'E9', stage: 'E', title: 'A단조 에튀드', tip: 'V화음(E장조)에서 G♯가 나와요. G♯4는 왼손 검지 옆 키.', spec: { key: 'Am', pattern: 'etude', positions: 'cross' }, tempo: 56 },
];

export interface MakeOptions { perBeat: number; bowing: Bowing; seed: number; title?: string; tempo?: number }
export interface Made extends Built { title: string; describe: string }

export function makeExercise(spec: ExerciseSpec, o: MakeOptions): Made {
  const key: Key = keyById(spec.key);
  const r = { ...rangeOf(spec.positions ?? 'full'), ...(spec.lo ? { lo: spec.lo } : {}) };
  const perBeat = spec.perBeat ?? o.perBeat;
  const bowing = spec.bowing ?? o.bowing;
  if (spec.pattern === 'song') {
    const s = songById(spec.song ?? '');
    if (!s) return { xml: '', notes: [], breakKeys: [], measures: 0, error: '곡을 찾을 수 없어요.', title: '', describe: '' };
    const b = buildSong(s, o.tempo ?? s.tempo);
    return { ...b, title: o.title ?? s.title, describe: '' };
  }
  if (spec.pattern === 'art') {
    const base = spec.base ?? 'five';
    const v = variantById(spec.variant ?? '1');
    const bl = ART_BASES.find((b) => b.id === base)!;
    const title = o.title ?? `텅잉 ${v.id}. ${v.label} · ${key.name} ${bl.label}`;
    const b = build({ title, key, phrases: artBase(key, base), perBeat: 2, bowing: 'detache', art: v.pattern, tempo: o.tempo });
    return { ...b, title, describe: '' };
  }
  let phrases: Phrase[];
  let rangeText = '';
  const rangeLabel = RANGE_SETS.find((p) => p.id === spec.positions)?.label.replace(/ \(.*\)/, '') ?? '';
  if (spec.pattern === 'twelfths') phrases = twelfths();
  else if (spec.pattern === 'breakDrill') phrases = breakDrill();
  else if (spec.pattern === 'chromatic') phrases = chromatic(r.lo, r.hi);
  else if (spec.pattern === 'etude') {
    const ar = autoRange(key, r, 2) ?? autoRange(key, r, 1);
    if (!ar) return { xml: '', notes: [], breakKeys: [], measures: 0, error: `${key.name}는 이 음역에서 만들 수 없어요.`, title: '', describe: '' };
    phrases = etude(key, { lo: ar[0], hi: ar[1], perBeat: Math.max(2, perBeat), seed: o.seed, r, highMiddle: spec.positions !== 'low' });
    rangeText = `#${o.seed}`;
  } else {
    const ar = autoRange(key, r, spec.octaves ?? 2);
    if (!ar) return { xml: '', notes: [], breakKeys: [], measures: 0, error: `${key.name}는 ${rangeLabel}에서 낼 수 없어요.`, title: '', describe: '' };
    const fn = { scale, arpeggio, thirds, seq4 }[spec.pattern as 'scale' | 'arpeggio' | 'thirds' | 'seq4'];
    phrases = fn(key, ar[0], ar[1]);
    const oct = Math.round((ar[1] - ar[0]) / 7);
    rangeText = (ar[1] - ar[0]) % 7 === 0 ? `${oct}옥타브` : '';
  }
  const patLabel = PATTERNS.find((p) => p.id === spec.pattern)?.label ?? (spec.pattern === 'twelfths' ? '12도 올리기' : spec.pattern === 'breakDrill' ? '브레이크 넘기' : '');
  const title = o.title ?? (spec.pattern === 'twelfths' || spec.pattern === 'breakDrill' ? patLabel : spec.pattern === 'chromatic' ? `반음계 · ${rangeLabel}` : [key.name, patLabel, rangeText, `· ${rangeLabel}`].filter(Boolean).join(' '));
  const b = build({ title, key, phrases, perBeat: spec.pattern === 'etude' ? Math.max(2, perBeat) : perBeat, bowing, tempo: o.tempo });
  return { ...b, title, describe: '' };
}
