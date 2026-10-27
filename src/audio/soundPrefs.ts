/** 재생 소리 설정 (설정 화면 → 여기, 재생할 때 읽음) */
export type ReverbLevel = 'off' | 'small' | 'normal';
let reverb: ReverbLevel = 'small';
let fluteVibrato = true;
let soundSet: string | undefined;
export function setSoundPrefs(p: { reverb?: ReverbLevel; fluteVibrato?: boolean; soundSet?: string }) {
  if (p.reverb) reverb = p.reverb;
  if (p.fluteVibrato !== undefined) fluteVibrato = p.fluteVibrato;
  if ('soundSet' in p) soundSet = p.soundSet;
}
export const reverbLevel = () => reverb;
export const fluteVibratoOn = () => fluteVibrato;
/** 고른 악기 소리 id. 예전 설정(플룻 비브라토 끔)은 '비브라토 없이' 로 */
export const soundSetId = (inst: string) => soundSet ?? (inst === 'flute' && !fluteVibrato ? 'vsco-nv' : undefined);
