/** 재생 소리 설정 (설정 화면 → 여기, 재생할 때 읽음) */
export type ReverbLevel = 'off' | 'small' | 'normal';
let reverb: ReverbLevel = 'small';
let fluteVibrato = true;
export function setSoundPrefs(p: { reverb?: ReverbLevel; fluteVibrato?: boolean }) {
  if (p.reverb) reverb = p.reverb;
  if (p.fluteVibrato !== undefined) fluteVibrato = p.fluteVibrato;
}
export const reverbLevel = () => reverb;
export const fluteVibratoOn = () => fluteVibrato;
