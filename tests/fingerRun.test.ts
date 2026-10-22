import { describe, it, expect } from 'vitest';
import { keyPitchClasses, notesInKey, nextUp, nextRandom, nextTarget } from '../src/exercise/fingerRun';
import { MAJOR_KEYS } from '../src/exercise/theory';

const key = (id: string) => MAJOR_KEYS.find((k) => k.id === id)!;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('운지표 연습 다음 음', () => {
  it('장조 음높이 종류', () => {
    expect([...keyPitchClasses(key('C'))].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(keyPitchClasses(key('F#')).has(5)).toBe(true); // E♯ = F
    expect(keyPitchClasses(key('Bb')).has(10)).toBe(true);
    expect(keyPitchClasses(key('Bb')).has(11)).toBe(false);
  });
  it('반음씩 위로, 끝이면 처음으로, 목록에 없는 음에서도', () => {
    expect(nextUp([60, 61, 62], 60)).toBe(61);
    expect(nextUp([60, 61, 62], 62)).toBe(60);
    expect(nextUp([60, 64, 67], 62)).toBe(64);
    expect(nextUp([], 60)).toBeNull();
  });
  it('이 조 음계만: G장조 F♯ 다음은 G, 끝이면 가장 낮은 음', () => {
    const list = range(64, 79);
    expect(notesInKey(list, key('G'))).toEqual([64, 66, 67, 69, 71, 72, 74, 76, 78, 79]);
    expect(nextTarget('key', list, 66, key('G'))).toBe(67);
    expect(nextTarget('key', list, 79, key('G'))).toBe(64);
    expect(nextTarget('key', list, 65, key('G'))).toBe(66); // 음계 밖에서 시작해도 다음 음계 음
  });
  it('무작위는 같은 음을 연달아 안 냄', () => {
    let s = 1;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 50; i++) { const n = nextRandom([60, 62, 64], 62, rand)!; expect(n).not.toBe(62); expect([60, 64]).toContain(n); }
    expect(nextRandom([60], 60)).toBe(60);
    expect(nextTarget('up', [60, 62], 60)).toBe(62);
  });
});
