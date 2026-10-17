import { keyById, dOf, type Pitch } from './theory';
import { toMusicXML, isBreak, DIV, type BuiltNote, type Built } from './build';

/**
 * 입문용 쉬운 곡 (모두 저작권이 끝난 전래·민요 선율). 클라리넷 악보음.
 * 형식: "E4:q" (w 온, h 2분, q 4분, e 8분, s 16분, 뒤에 . 이면 점음표), 쉼표 "r:q", 임시표 "F#4" "Bb4", 마디 구분 "|" (읽기용)
 */
export interface Song { id: string; title: string; key: string; tempo: number; text: string; tip: string; range: string }

export const SONGS: Song[] = [
  { id: 'hotcross', title: '뜨거운 십자가 빵 (Hot Cross Buns)', key: 'C', tempo: 80, range: 'C4~E4',
    text: 'E4:q D4:q C4:h | E4:q D4:q C4:h | C4:e C4:e C4:e C4:e D4:e D4:e D4:e D4:e | E4:q D4:q C4:h',
    tip: '왼손 세 손가락만. 음마다 "투"로 시작해요.' },
  { id: 'mary', title: '떴다 떴다 비행기 (Mary Had a Little Lamb)', key: 'C', tempo: 84, range: 'C4~G4',
    text: 'E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w',
    tip: 'G4는 아무것도 막지 않는 "열린 G". 왼손을 너무 높이 들지 마세요.' },
  { id: 'twinkle', title: '반짝반짝 작은 별', key: 'C', tempo: 80, range: 'C4~A4',
    text: 'C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h',
    tip: 'C4 → G4로 뛸 때 왼손을 한꺼번에 떼요. A4는 왼손 검지로 A 키.' },
  { id: 'butterfly', title: '나비야 (Lightly Row)', key: 'C', tempo: 88, range: 'C4~G4',
    text: 'G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q D4:q E4:q F4:q | G4:q G4:q G4:h | G4:q E4:q E4:q E4:q | F4:q D4:q D4:q D4:q | C4:q E4:q G4:q G4:q | E4:q E4:q E4:h',
    tip: '같은 음이 이어질 때 숨은 끊지 말고 혀로만 나눠요.' },
  { id: 'ode', title: '환희의 송가 (베토벤)', key: 'C', tempo: 84, range: 'C4~G4',
    text: 'E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:e D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:e C4:h',
    tip: '점4분음표는 한 박 반. 8분음표가 서두르지 않게.' },
  { id: 'jingle', title: '징글벨 (후렴)', key: 'C', tempo: 100, range: 'C4~G4',
    text: 'E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q. D4:e | E4:w | F4:q F4:q F4:q. F4:e | F4:q E4:q E4:q E4:e E4:e | E4:q D4:q D4:q E4:q | D4:h G4:h | E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q. D4:e | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:e E4:e | G4:q G4:q F4:q D4:q | C4:w',
    tip: 'G4 → C4로 내려올 때 왼손 세 손가락을 동시에 정확히.' },
  { id: 'moon', title: '달빛 아래서 (Au clair de la lune)', key: 'C', tempo: 80, range: 'G3~E4',
    text: 'C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w | C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w | D4:q D4:q D4:q D4:q | A3:h A3:h | D4:q C4:q B3:q A3:q | G3:w | C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w',
    tip: '가운데 부분에서 오른손을 써요. B3는 오른손 중지 하나(갈래 운지), G3는 모두 막기.' },
  { id: 'ode-g', title: '환희의 송가 · 브레이크 넘기 (G장조)', key: 'G', tempo: 72, range: 'G4~D5',
    text: 'B4:q B4:q C5:q D5:q | D5:q C5:q B4:q A4:q | G4:q G4:q A4:q B4:q | B4:q. A4:e A4:h | B4:q B4:q C5:q D5:q | D5:q C5:q B4:q A4:q | G4:q G4:q A4:q B4:q | A4:q. G4:e G4:h',
    tip: 'A4 ↔ B4가 브레이크예요. A4를 불 때 오른손을 미리 내려 두면 넘기 쉬워요.' },
  { id: 'twinkle-g', title: '반짝반짝 작은 별 · 브레이크 넘기 (G장조)', key: 'G', tempo: 72, range: 'G4~E5',
    text: 'G4:q G4:q D5:q D5:q | E5:q E5:q D5:h | C5:q C5:q B4:q B4:q | A4:q A4:q G4:h | D5:q D5:q C5:q C5:q | B4:q B4:q A4:h | D5:q D5:q C5:q C5:q | B4:q B4:q A4:h | G4:q G4:q D5:q D5:q | E5:q E5:q D5:h | C5:q C5:q B4:q B4:q | A4:q A4:q G4:h',
    tip: '첫 마디 G4 → D5는 열린 음에서 모두 막기로 가는 큰 이동. 손가락을 한꺼번에, 레지스터 키도 같이.' },
];
/** 1단계 첫 소리 연습 (긴 음 위주, 쉼표에서 숨 쉬기) */
export const BASICS: Song[] = [
  { id: 'a-left3', title: '왼손 세 음 · E4 F4 G4', key: 'C', tempo: 60, range: 'E4~G4',
    text: 'G4:h r:h | F4:h r:h | E4:h r:h | F4:h r:h | G4:h F4:h | E4:h F4:h | G4:w | r:w | G4:q F4:q E4:q F4:q | G4:q F4:q E4:h',
    tip: '열린 G → 엄지(F) → 엄지+검지(E). 손가락 바닥으로 구멍을 막고, 쉼표에서 숨을 쉬어요.' },
  { id: 'a-left5', title: '왼손 다섯 음 · C4~G4', key: 'C', tempo: 60, range: 'C4~G4',
    text: 'C4:h D4:h | E4:h F4:h | G4:w | r:w | G4:h F4:h | E4:h D4:h | C4:w | r:w | C4:q D4:q E4:q F4:q | G4:q F4:q E4:q D4:q | C4:w',
    tip: 'C4는 왼손 세 손가락 모두. 구멍이 조금만 새도 "삑" 소리가 나요. 오른손 엄지로 악기를 받쳐요.' },
  { id: 'a-throat', title: '스로트 음 · G4 G♯4 A4 B♭4', key: 'C', tempo: 60, range: 'G4~B♭4',
    text: 'G4:h r:h | G#4:h r:h | A4:h r:h | Bb4:h r:h | A4:h G#4:h | G4:w | G4:q A4:q Bb4:q A4:q | G4:w',
    tip: 'A 키·G♯ 키는 왼손 검지를 굴려서 눌러요. B♭4는 A 키 + 레지스터 키.' },
  { id: 'a-right', title: '오른손 더하기 · G3~C4', key: 'C', tempo: 60, range: 'G3~C4',
    text: 'C4:h r:h | B3:h r:h | A3:h r:h | G3:h r:h | A3:h B3:h | C4:w | C4:q B3:q A3:q G3:q | A3:q B3:q C4:h',
    tip: '왼손은 그대로 두고 오른손만 더해요. B3는 오른손 중지 하나. G3는 여섯 구멍 모두.' },
  { id: 'a-pinky', title: '새끼손가락 키 · E3~A3', key: 'C', tempo: 56, range: 'E3~A3',
    text: 'G3:h r:h | F#3:h r:h | F3:h r:h | E3:h r:h | F3:h F#3:h | G3:w | E3:q F3:q G3:q A3:q | G3:q F3:q E3:h',
    tip: '모든 구멍을 막은 채 새끼손가락으로 키를 눌러요. E는 왼손, F는 오른손, F♯은 왼손 새끼.' },
];
/* ---------- 플룻 (C조, 실음) ---------- */

const SPELL: [string, string][] = [['C', ''], ['C', '#'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''], ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['B', 'b'], ['B', '']];
/** 곡 글을 반음 단위로 옮기기 (C♯·F♯·G♯ 올림, E♭·B♭ 내림) */
export function transposeText(text: string, semis: number): string {
  return text.replace(/\b([A-G])(#|b)?(\d):/g, (_, L: string, acc: string | undefined, o: string) => {
    const m = 12 * (Number(o) + 1) + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(L)] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + semis;
    const [l, a] = SPELL[((m % 12) + 12) % 12];
    return `${l}${a}${Math.floor(m / 12) - 1}:`;
  });
}
const KEY_UP: Record<number, Record<string, string>> = { 2: { C: 'D', G: 'A' }, 7: { C: 'G', G: 'D' } };
/** 클라리넷 곡을 플룻용으로 (G장조 +7 또는 D장조 +2) */
function forFlute(id: string, semis: 2 | 7, tip: string, range: string): Song {
  const s = SONGS.find((x) => x.id === id)!;
  return { ...s, id: `fl-${id}`, key: KEY_UP[semis][s.key], text: transposeText(s.text, semis), tip, range, title: s.title.replace(/ · .*$/, '') + (semis === 2 ? ' (D장조)' : ' (G장조)') };
}

export const FLUTE_BASICS: Song[] = [
  { id: 'fa-bag', title: '왼손 세 음 · B4 A4 G4', key: 'G', tempo: 60, range: 'G4~B4',
    text: 'B4:h r:h | A4:h r:h | G4:h r:h | A4:h r:h | B4:h A4:h | G4:h A4:h | B4:w | r:w | B4:q A4:q G4:q A4:q | B4:q A4:q G4:h',
    tip: 'B = 엄지 + 검지, A = 엄지 + 검지·중지, G = 엄지 + 왼손 세 손가락. 오른손 새끼는 E♭ 키 위에 계속 둬요.' },
  { id: 'fa-c5', title: 'C5 · C♯5', key: 'G', tempo: 60, range: 'G4~C♯5',
    text: 'B4:h r:h | C5:h r:h | B4:h C5:h | B4:w | r:w | A4:h r:h | C#5:h r:h | B4:q C5:q B4:q A4:q | G4:w',
    tip: 'C5는 왼손 검지만, C♯5는 거의 다 떼요. 악기가 흔들리지 않게 왼손 검지 아래·오른손 엄지·오른손 새끼로 받쳐요.' },
  { id: 'fa-right', title: '오른손 더하기 · G F♯ E D', key: 'G', tempo: 60, range: 'D4~G4',
    text: 'G4:h r:h | F#4:h r:h | E4:h r:h | D4:h r:h | E4:h F#4:h | G4:w | G4:q F#4:q E4:q D4:q | E4:q F#4:q G4:h',
    tip: 'F♯은 오른손 약지만, E는 검지·중지, D는 셋 다 + 새끼를 E♭ 키에서 떼요. 낮은 음은 숨을 느리고 넓게.' },
  { id: 'fa-f', title: 'F4 · B♭4', key: 'F', tempo: 60, range: 'E4~B♭4',
    text: 'G4:h F4:h | E4:h F4:h | G4:h A4:h | Bb4:h A4:h | G4:w | F4:q G4:q A4:q Bb4:q | A4:q G4:q F4:h',
    tip: 'F는 오른손 검지 하나, B♭은 "1 대 1"(왼손 검지 + 오른손 검지).' },
  { id: 'fa-low', title: '낮은 음 · C4 C♯4 E♭4', key: 'C', tempo: 56, range: 'C4~F4',
    text: 'D4:h r:h | C4:h r:h | D4:h E4:h | C4:w | r:w | Eb4:h D4:h | C#4:h D4:h | C4:q D4:q E4:q F4:q | E4:q D4:q C4:h',
    tip: '오른손 새끼로 E♭ 키 → C♯ 롤러 → C 롤러. 낮은 음은 입술 구멍을 조금 크게, 숨은 느리게, 취구를 조금 더 덮어요.' },
];

export const FLUTE_SONGS: Song[] = [
  forFlute('hotcross', 7, 'B·A·G 세 음만. 음마다 "투"로 시작해요.', 'G4~B4'),
  forFlute('mary', 2, 'F♯는 오른손 약지만. E·D로 내려갈 때 오른손을 차례로 내려요.', 'D4~A4'),
  forFlute('twinkle', 2, 'D4 → A4로 뛸 때 오른손을 한꺼번에 떼요. 낮은 D는 오른손 새끼를 떼는 것 잊지 말기.', 'D4~B4'),
  forFlute('butterfly', 2, '같은 음이 이어질 때 숨은 끊지 말고 혀로만 나눠요.', 'D4~A4'),
  forFlute('ode', 2, '점4분음표는 한 박 반. 8분음표가 서두르지 않게.', 'D4~A4'),
  forFlute('jingle', 2, 'A4 → D4로 내려올 때 손가락을 동시에 정확히.', 'D4~A4'),
  forFlute('moon', 7, '가운데 부분에서 낮은 D·E·F♯를 써요. 낮은 음은 숨을 느리게.', 'D4~B4'),
];

const ALL = [...BASICS, ...SONGS, ...FLUTE_BASICS, ...FLUTE_SONGS];
export const songById = (id: string) => ALL.find((s) => s.id === id);

const DUR: Record<string, number> = { w: 96, h: 48, q: 24, e: 12, s: 6 };

export function parseSong(text: string, breakAt = 71): BuiltNote[] {
  const out: BuiltNote[] = [];
  let prev: Pitch | null = null;
  for (const tok of text.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [n, d] = tok.split(':');
    const dot = d.endsWith('.');
    const base = DUR[d.replace('.', '')];
    if (!base) throw new Error(`길이를 모르겠어요: ${tok}`);
    const dur = dot ? base * 1.5 : base;
    if (n === 'r') { out.push({ p: null, dur }); continue; }
    const m = /^([A-G])(#|b)?(\d)$/.exec(n);
    if (!m) throw new Error(`음을 모르겠어요: ${tok}`);
    const p: Pitch = { d: dOf(m[1], Number(m[3])), alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 };
    out.push({ p, dur, brk: isBreak(prev, p, breakAt) });
    prev = p;
  }
  return out;
}

export function buildSong(s: Song, tempo = s.tempo, breakAt = 71): Built & { title: string } {
  const notes = parseSong(s.text, breakAt);
  const total = notes.reduce((a, n) => a + n.dur, 0);
  if (total % (4 * DIV) !== 0) throw new Error(`${s.title}: 마디가 맞지 않아요 (${total / DIV}박)`);
  const b = toMusicXML({ title: s.title, key: keyById(s.key), tempo, composer: '전래·민요' }, notes);
  return { ...b, title: s.title };
}
