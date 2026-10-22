/** 운지표 연습: 맞게 불면 넘어갈 다음 음 고르기 (악보음 midi, 운지표에 있는 음만) */
import { keyAlter, type Key } from './theory';

export type RunMode = 'up' | 'key' | 'random';
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 장조 음계의 음높이 종류 (0~11) */
export function keyPitchClasses(key: Pick<Key, 'fifths'>): Set<number> {
  return new Set('CDEFGAB'.split('').map((L) => (((SEMI[L] + keyAlter(key.fifths, L)) % 12) + 12) % 12));
}

/** 이 조 음계에 드는 음만 (낮은 음부터) */
export const notesInKey = (list: number[], key: Pick<Key, 'fifths'>) => {
  const pcs = keyPitchClasses(key);
  return [...list].sort((a, b) => a - b).filter((m) => pcs.has(((m % 12) + 12) % 12));
};

/** 다음 음: 지금보다 높은 첫 음, 끝이면 처음으로 (지금 음이 목록에 없어도 됨) */
export function nextUp(list: number[], cur: number): number | null {
  const s = [...list].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.find((m) => m > cur) ?? s[0];
}

/** 무작위 (같은 음 연달아 안 나오게) */
export function nextRandom(list: number[], cur: number, rand: () => number = Math.random): number | null {
  const pool = list.filter((m) => m !== cur);
  if (!pool.length) return list.length ? list[0] : null;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

/** 연습 방식에 따라 다음 음 */
export function nextTarget(mode: RunMode, list: number[], cur: number, key?: Pick<Key, 'fifths'>, rand?: () => number): number | null {
  if (mode === 'key' && key) return nextUp(notesInKey(list, key), cur);
  if (mode === 'random') return nextRandom(list, cur, rand);
  return nextUp(list, cur);
}
