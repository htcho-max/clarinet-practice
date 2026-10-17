import { type Key, scalePitch, dOf } from './theory';
import type { ArtPattern } from './build';
import type { Phrase, PNote } from './patterns';

/**
 * 아티큘레이션(텅잉·슬러) 연습: 짧은 기본 악구 하나를 여러 가지 텅잉·슬러 조합으로 반복.
 * 기본 악구는 8분음표 16개 = 2마디 + 마침음. (클로제·바이크만 교본의 아티큘레이션 연습 방식)
 */
export type ArtBaseId = 'five' | 'scale' | 'arp' | 'break';
export const ART_BASES: { id: ArtBaseId; label: string; tip: string }[] = [
  { id: 'five', label: '다섯 음 (도~솔)', tip: '손가락은 쉬운 다섯 음. 혀와 숨에만 집중해요.' },
  { id: 'scale', label: '한 옥타브 음계', tip: '음계는 익숙하니 텅잉 모양을 고르게 하는 데 집중해요.' },
  { id: 'arp', label: '분산화음', tip: '음이 뛰어도 숨은 끊지 말고 혀로만 나눠요.' },
  { id: 'break', label: '브레이크 넘기', tip: '오른손을 내려 둔 채 스로트 음을 불면 넘기 쉬워요.' },
];
export const ART_KEYS = ['C', 'F', 'G'];

/** 기본 악구의 온음계 위치 (시작 음 = 0) */
const DEGREES: Record<ArtBaseId, { beats: number[][]; final: number }> = {
  five: { beats: [[0, 1], [2, 3], [4, 3], [2, 1], [0, 2], [4, 2], [3, 1], [2, 1]], final: 0 },
  scale: { beats: [[0, 1], [2, 3], [4, 5], [6, 7], [6, 5], [4, 3], [2, 1], [2, 1]], final: 0 },
  arp: { beats: [[0, 2], [4, 7], [4, 2], [0, 2], [4, 2], [0, 4], [2, 4], [2, 1]], final: 0 },
  break: { beats: [[0, 1], [2, 3], [4, 3], [2, 1], [0, 2], [4, 2], [3, 1], [2, 1]], final: 0 },
};
/** 시작 음 (악보음). 브레이크 악구는 스로트 음 근처에서 시작해 클라리온으로 넘어감 */
const START: Record<ArtBaseId, Record<string, number>> = {
  five: { C: dOf('C', 4), F: dOf('F', 3), G: dOf('G', 3) },
  scale: { C: dOf('C', 4), F: dOf('F', 3), G: dOf('G', 3) },
  arp: { C: dOf('C', 4), F: dOf('F', 3), G: dOf('G', 3) },
  break: { C: dOf('G', 4), F: dOf('F', 4), G: dOf('G', 4) },
};

export function artBase(key: Key, base: ArtBaseId): Phrase[] {
  const t = START[base][key.id] ?? key.startD;
  const spec = DEGREES[base];
  const flat = spec.beats.flat();
  const notes: PNote[] = flat.map((g, i) => ({ p: scalePitch(key, t + g, i > 0 && g < flat[i - 1] ? -1 : 1) }));
  return [notes, [{ p: scalePitch(key, t + spec.final, 1) }]];
}

export interface ArtVariant { id: string; label: string; pattern: ArtPattern; tip: string }
export const ART_VARIANTS: ArtVariant[] = [
  { id: '1', label: '모두 텅잉', pattern: { groups: [1] }, tip: '"투-투-투". 혀끝이 리드 끝에 살짝 닿았다 떨어지게. 숨은 계속 흘려요.' },
  { id: '2', label: '2음 슬러', pattern: { groups: [2] }, tip: '슬러 첫 음만 혀로 시작하고 둘째 음은 손가락만 움직여요.' },
  { id: '3', label: '4음 슬러', pattern: { groups: [4] }, tip: '한 숨에 이어서. 손가락을 동시에 정확히 움직여야 사이 소리가 안 나요.' },
  { id: '4', label: '8음 슬러', pattern: { groups: [8] }, tip: '숨 속도를 일정하게 유지해 끝 음까지 같은 소리로.' },
  { id: '5', label: '1 + 3 슬러', pattern: { groups: [1, 3] }, tip: '혀로 한 음, 이어서 세 음 슬러.' },
  { id: '6', label: '3 슬러 + 1', pattern: { groups: [3, 1] }, tip: '마지막 한 음을 혀로 분명하게. 슬러 끝 음이 짧아지지 않게.' },
  { id: '7', label: '2 슬러 + 1 + 1', pattern: { groups: [2, 1, 1] }, tip: '슬러 두 음과 텅잉 두 음의 길이가 같게.' },
  { id: '8', label: '1 + 1 + 2 슬러', pattern: { groups: [1, 1, 2] }, tip: '박 뒤쪽 슬러에서 서두르지 않게.' },
  { id: '9', label: '1 + 2 슬러 + 1', pattern: { groups: [1, 2, 1] }, tip: '가운데 슬러가 박을 넘어가도 리듬은 그대로.' },
  { id: '10', label: '스타카토', pattern: { groups: [1], stacc: 'all' }, tip: '혀로 소리를 멈춰요 (숨을 끊지 않음). "투트-투트"처럼 짧고 가볍게.' },
  { id: '11', label: '2 슬러 + 2 스타카토', pattern: { groups: [2, 1, 1], stacc: 'single' }, tip: '슬러는 길게, 스타카토는 짧게. 대비를 분명히.' },
  { id: '12', label: '테누토 (길게 텅잉)', pattern: { groups: [1], tenuto: true }, tip: '"다-다-다". 음 사이가 거의 붙도록 부드러운 혀.' },
  { id: '13', label: '박 첫 음 강세', pattern: { groups: [1], accent: true }, tip: '숨으로 강세를 주고 혀를 세게 치지 않아요.' },
  { id: '14', label: '점리듬 (긴-짧은)', pattern: { groups: [1], rhythm: [18, 6] }, tip: '짧은 음이 묻히지 않게. 메트로놈을 8분음표로 켜도 좋아요.' },
  { id: '15', label: '역점리듬 (짧은-긴)', pattern: { groups: [1], rhythm: [6, 18] }, tip: '짧은 첫 음을 또렷하게 시작해요.' },
  { id: '16', label: '점리듬 2음 슬러', pattern: { groups: [2], rhythm: [18, 6] }, tip: '슬러 안에서 리듬만 바꿔요. 손가락 타이밍을 정확히.' },
];
export const variantById = (id: string) => ART_VARIANTS.find((v) => v.id === id) ?? ART_VARIANTS[0];
export const artProgressId = (base: ArtBaseId, key: string, variant: string) => `art:${base}:${key}:${variant}`;
