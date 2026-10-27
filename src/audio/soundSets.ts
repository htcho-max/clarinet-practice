import type { InstrumentId } from '../instruments/current';
import clarinetVsco from './clarinetSamples.json';
import fluteVsco from './fluteSamples.json';
import clarinetSets from './clarinetSets.json';
import fluteSets from './fluteSets.json';

/** 매니페스트 줄: [파일 이름, 실음 midi, 샘플 자체 음정 오차(센트), 어택 길이(초)] */
export type SampleRow = [string, number, number, number];
/**
 * 악기 소리 한 벌. levels: 셈여림(0~1) 이 이 값보다 작으면 그 층 (차례대로, 마지막은 나머지 모두).
 * dir: public/ 아래 폴더. keep: 샘플 길이(초, 이보다 긴 음은 이어 붙임)
 */
export interface SampleSet {
  id: string; label: string; desc: string; credit: string;
  dir: string; keep: number;
  levels: [string, number][];
  layers: Record<string, SampleRow[]>;
}

const gleitz = (inst: InstrumentId, rows: Record<string, SampleRow[]>): SampleSet[] => [
  { id: 'musyng', label: 'Musyng Kite', desc: '부드럽고 따뜻한 사운드폰트 소리', credit: 'Musyng Kite 사운드폰트 · CC BY-SA 3.0', dir: `${inst}/musyng`, keep: 3, levels: [['main', 9]], layers: { main: rows.musyng } },
  { id: 'fatboy', label: 'FatBoy', desc: '밝고 또렷한 사운드폰트 소리', credit: 'FatBoy 사운드폰트 · CC BY-SA 3.0', dir: `${inst}/fatboy`, keep: 3, levels: [['main', 9]], layers: { main: rows.fatboy } },
  { id: 'fluid', label: 'Fluid R3 (뮤즈스코어 3 기본 계열)', desc: '뮤즈스코어 기본 사운드폰트의 바탕이 된 소리. 단정하고 가벼움', credit: 'Fluid R3 GM · CC BY 3.0 / MIT', dir: `${inst}/fluid`, keep: 3, levels: [['main', 9]], layers: { main: rows.fluid } },
];
const nameRows = (rows: SampleRow[]) => rows.map((r) => [r[0], r[1], r[2], r[3]] as SampleRow);
const gRows = (j: Record<string, (string | number | null)[][]>) => Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v.map((r) => [String(r[0]), Number(r[1]), Number(r[2] ?? 0), Number(r[3])] as SampleRow)]));

const cv = clarinetVsco as unknown as { keep: number; layers: Record<string, SampleRow[]> };
const fv = fluteVsco as unknown as { keep: number; layers: Record<string, SampleRow[]> };

export const SOUND_SETS: Record<InstrumentId, SampleSet[]> = {
  clarinet: [
    { id: 'vsco', label: '실제 녹음 (VSCO 2)', desc: '실제 클라리넷 녹음. 여리게·보통·세게 세 가지 녹음을 셈여림에 따라 골라 써요', credit: 'VSCO 2 Community Edition · CC0', dir: 'clarinet', keep: cv.keep, levels: [['p', 0.52], ['mf', 0.8], ['f', 9]], layers: { p: nameRows(cv.layers.p), mf: nameRows(cv.layers.mf), f: nameRows(cv.layers.f) } },
    ...gleitz('clarinet', gRows(clarinetSets as never)),
  ],
  flute: [
    { id: 'vsco', label: '실제 녹음 · 비브라토 (VSCO 2)', desc: '비브라토를 넣어 분 실제 플룻 녹음', credit: 'VSCO 2 Community Edition · CC0', dir: 'flute', keep: fv.keep, levels: [['vib', 9]], layers: { vib: nameRows(fv.layers.vib) } },
    { id: 'vsco-nv', label: '실제 녹음 · 비브라토 없이 (VSCO 2)', desc: '비브라토 없이 곧게 분 녹음. 여리게·세게 두 가지를 셈여림에 따라 골라 써요', credit: 'VSCO 2 Community Edition · CC0', dir: 'flute', keep: fv.keep, levels: [['p', 0.65], ['f', 9]], layers: { p: nameRows(fv.layers.p), f: nameRows(fv.layers.f) } },
    ...gleitz('flute', gRows(fluteSets as never)),
  ],
};

/** 고른 소리 (없거나 모르는 id 면 첫 번째) */
export function soundSetFor(inst: InstrumentId, id: string | undefined): SampleSet {
  const list = SOUND_SETS[inst];
  return list.find((s) => s.id === id) ?? list[0];
}
/** 셈여림 → 층 */
export function layerOf(set: SampleSet, level: number): string {
  for (const [l, max] of set.levels) if (level < max) return l;
  return set.levels[set.levels.length - 1][0];
}
