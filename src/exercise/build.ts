import { type Key, type Pitch, letterOf, octaveOf, keyAlter, pitchName, midiOf } from './theory';
import type { Phrase } from './patterns';

export const DIV = 24; // 4분음표 하나

/** 아티큘레이션 (모든 음 텅잉 / 슬러 묶음 / 스타카토) */
export type Bowing = 'detache' | 'slur2' | 'slurBeat' | 'slur2Beats' | 'staccato';
export const BOWINGS: { id: Bowing; label: string }[] = [
  { id: 'detache', label: '모두 텅잉' },
  { id: 'slur2', label: '2음 슬러' },
  { id: 'slurBeat', label: '한 박 슬러' },
  { id: 'slur2Beats', label: '두 박 슬러' },
  { id: 'staccato', label: '스타카토' },
];
export const RHYTHMS: { perBeat: number; label: string }[] = [
  { perBeat: 0.5, label: '2분음표' },
  { perBeat: 1, label: '4분음표' },
  { perBeat: 2, label: '8분음표' },
  { perBeat: 3, label: '셋잇단' },
  { perBeat: 4, label: '16분음표' },
];

/** 아티큘레이션 변형: 슬러 묶음 크기(반복), 리듬(반복, DIV 단위), 꾸밈 */
export interface ArtPattern {
  groups: number[];
  rhythm?: number[];
  /** all = 모든 음, slurred = 슬러 안 음, single = 슬러 밖 음 */
  stacc?: 'all' | 'slurred' | 'single';
  accent?: boolean; // 박의 첫 음
  tenuto?: boolean;
  words?: string;
}

export interface BuildOptions {
  title: string;
  key: Key;
  phrases: Phrase[];
  perBeat: number;
  bowing: Bowing;
  tempo?: number;
  art?: ArtPattern;
  /** 한 마디 박 수 (4/4 = 4) */
  beats?: number;
  /** 넘는 음 경계 (isBreak) */
  breakAt?: number;
}
export interface BuiltNote { p: Pitch | null; dur: number; brk?: boolean; slur?: 'start' | 'stop'; stacc?: boolean; accent?: boolean; tenuto?: boolean; words?: string; tie?: 'start' | 'stop' | 'both' }
export interface Built { xml: string; notes: BuiltNote[]; breakKeys: string[]; measures: number; error?: string }

/** 브레이크(B♭4 ↔ B4)를 넘는지 */
/** 넘는 음인지: 앞 음과 이 음이 at(이 음부터 위쪽) 경계를 사이에 두는지. 클라리넷 브레이크 at=71(B4), 플룻 at=74(D5) */
export const isBreak = (a: Pitch | null, b: Pitch | null, at = 71) => !!a && !!b && ((midiOf(a) < at && midiOf(b) >= at) || (midiOf(a) >= at && midiOf(b) < at));

/** 패턴 → 리듬·아티큘레이션이 붙은 음 목록 */
export function arrange(o: BuildOptions): BuiltNote[] {
  const MEAS = (o.beats ?? 4) * DIV;
  const u = DIV / o.perBeat;
  const out: BuiltNote[] = [];
  let pos = 0;
  const groupLen = o.bowing === 'slur2' ? 2 : o.bowing === 'slurBeat' ? Math.max(1, o.perBeat) : o.bowing === 'slur2Beats' ? Math.max(1, o.perBeat * 2) : 1;
  const art: ArtPattern = o.art ?? { groups: [groupLen], stacc: o.bowing === 'staccato' ? 'all' : undefined };
  let prev: Pitch | null = null;
  o.phrases.forEach((ph, pi) => {
    const lastPhrase = pi === o.phrases.length - 1;
    const start = out.length;
    ph.forEach((n, j) => {
      let dur = art.rhythm ? art.rhythm[j % art.rhythm.length] : u;
      const isFinal = lastPhrase && j === ph.length - 1;
      const isEnd = j === ph.length - (lastPhrase ? 2 : 1); // 프레이즈 끝 (마침음 앞 음 포함)
      if (isFinal) dur = MEAS - (pos % MEAS); // 마침음은 마디 끝까지 (항상 박 위에서 시작)
      else if (isEnd) dur = (pos + dur) % DIV === 0 ? dur : DIV - (pos % DIV); // 박 끝까지 늘림
      out.push({ p: n.p, dur, brk: isBreak(prev, n.p, o.breakAt), stacc: art.stacc === 'all' && !isFinal, accent: art.accent && pos % DIV === 0 && !isFinal, tenuto: art.tenuto && !isFinal });
      prev = n.p;
      pos += dur;
    });
    // 슬러 묶음 (프레이즈 안에서만, 마침음은 제외)
    const end = lastPhrase ? out.length - 1 : out.length;
    let a = start, g = 0;
    while (a < end) {
      const size = art.groups[g++ % art.groups.length];
      const b = Math.min(end, a + size) - 1;
      if (b > a) {
        out[a].slur = 'start'; out[b].slur = 'stop';
        if (art.stacc === 'slurred') for (let x = a; x <= b; x++) out[x].stacc = true;
      } else if (art.stacc === 'single' && b === a) out[a].stacc = true;
      a += size;
    }
  });
  if (out.length) out[0].words = art.words;
  // 마지막 마디가 덜 찼으면 쉼표로 채우기
  while (pos % MEAS !== 0) { const d = pos % DIV ? DIV - (pos % DIV) : DIV; out.push({ p: null, dur: d }); pos += d; }
  return splitLong(out, MEAS);
}

/** 마디를 넘는 긴 음을 붙임줄로 나누기 (2분음표 리듬 등) */
function splitLong(notes: BuiltNote[], MEAS: number): BuiltNote[] {
  const out: BuiltNote[] = [];
  let pos = 0;
  for (const n of notes) {
    let left = n.dur, first = true;
    while (left > 0) {
      const room = MEAS - (pos % MEAS);
      const d = Math.min(left, room);
      const piece: BuiltNote = { ...n, dur: d };
      if (!first) { piece.slur = undefined; piece.stacc = false; piece.accent = false; piece.words = undefined; piece.brk = false; }
      if (n.p && left > d) piece.tie = first ? 'start' : 'both';
      else if (n.p && !first) piece.tie = 'stop';
      if (left > d && n.slur === 'stop') piece.slur = undefined;
      out.push(piece);
      if (!first && left === d && n.slur === 'stop') piece.slur = 'stop';
      left -= d; pos += d; first = false;
    }
  }
  return out;
}

const TYPES: Record<number, [string, number, boolean]> = { // dur → [type, dots, triplet]
  3: ['32nd', 0, false], 9: ['16th', 1, false], 4: ['16th', 0, true], 6: ['16th', 0, false], 8: ['eighth', 0, true], 12: ['eighth', 0, false], 16: ['quarter', 0, true],
  18: ['eighth', 1, false], 24: ['quarter', 0, false], 36: ['quarter', 1, false], 48: ['half', 0, false], 72: ['half', 1, false], 96: ['whole', 0, false],
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** 음 목록 → MusicXML. 한 마디 = beats 박 */
export function toMusicXML(o: { title: string; key: Key; tempo?: number; beats?: number; composer?: string }, notes: BuiltNote[]): Built {
  const MEAS = (o.beats ?? 4) * DIV;
  const measures: string[] = [];
  let cur: string[] = [];
  let pos = 0, idxInMeasure = 0, mnum = 1;
  let acc = new Map<string, number>();
  const breakKeys: string[] = [];
  const beams = beamPlan(notes);
  let tupletOpen = false;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (pos % MEAS === 0) {
      if (cur.length) measures.push(wrapMeasure(mnum++, cur, measures.length === 0, o));
      cur = []; idxInMeasure = 0; acc = new Map();
    }
    let t = TYPES[n.dur];
    if (!t && !n.p && n.dur === MEAS) t = ['whole', 0, false]; // 온쉼표 (3/4 등)
    if (!t) return { xml: '', notes, breakKeys, measures: 0, error: `표현할 수 없는 길이 ${n.dur}` };
    const [type, dots, trip] = t;
    if (n.words) cur.push(`<direction placement="above"><direction-type><words font-size="9" font-style="italic">${esc(n.words)}</words></direction-type></direction>`);
    const x: string[] = ['<note>'];
    if (n.p) {
      const L = letterOf(n.p.d), oct = octaveOf(n.p.d);
      const accKey = `${L}${oct}`;
      const prev = acc.has(accKey) ? acc.get(accKey)! : keyAlter(o.key.fifths, L);
      x.push(`<pitch><step>${L}</step>${n.p.alter ? `<alter>${n.p.alter}</alter>` : ''}<octave>${oct}</octave></pitch>`);
      x.push(`<duration>${n.dur}</duration>`);
      if (n.tie === 'stop' || n.tie === 'both') x.push('<tie type="stop"/>');
      if (n.tie === 'start' || n.tie === 'both') x.push('<tie type="start"/>');
      x.push(`<voice>1</voice><type>${type}</type>${'<dot/>'.repeat(dots)}`);
      if (prev !== n.p.alter && !(n.tie === 'stop' || n.tie === 'both')) { x.push(`<accidental>${n.p.alter >= 2 ? 'double-sharp' : n.p.alter > 0 ? 'sharp' : n.p.alter <= -2 ? 'flat-flat' : n.p.alter < 0 ? 'flat' : 'natural'}</accidental>`); acc.set(accKey, n.p.alter); }
    } else {
      x.push(`<rest${n.dur === MEAS ? ' measure="yes"' : ''}/><duration>${n.dur}</duration><voice>1</voice><type>${type}</type>${'<dot/>'.repeat(dots)}`);
    }
    if (trip) x.push('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>');
    beams[i].forEach((b, l) => x.push(`<beam number="${l + 1}">${b}</beam>`));
    const nots: string[] = [];
    if (n.tie === 'stop' || n.tie === 'both') nots.push('<tied type="stop"/>');
    if (n.tie === 'start' || n.tie === 'both') nots.push('<tied type="start"/>');
    if (trip && pos % DIV === 0) { nots.push('<tuplet type="start" bracket="no"/>'); tupletOpen = true; }
    if (trip && tupletOpen && (pos + n.dur) % DIV === 0) { nots.push('<tuplet type="stop"/>'); tupletOpen = false; }
    if (n.slur) nots.push(`<slur type="${n.slur}" number="1"/>`);
    if (n.p && (n.stacc || n.accent || n.tenuto)) nots.push(`<articulations>${n.accent ? '<accent/>' : ''}${n.stacc ? '<staccato/>' : ''}${n.tenuto ? '<tenuto/>' : ''}</articulations>`);
    if (nots.length) x.push(`<notations>${nots.join('')}</notations>`);
    x.push('</note>');
    cur.push(x.join(''));
    if (n.p && !(n.tie === 'stop' || n.tie === 'both')) { if (n.brk) breakKeys.push(`${mnum}:${idxInMeasure}`); idxInMeasure++; }
    pos += n.dur;
  }
  if (cur.length) measures.push(wrapMeasure(mnum, cur, measures.length === 0, o));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><work><work-title>${esc(o.title)}</work-title></work>
<identification><creator type="composer">${esc(o.composer ?? '연습곡 생성기')}</creator></identification>
<part-list><score-part id="P1"><part-name>Clarinet</part-name></score-part></part-list>
<part id="P1">${measures.join('\n')}</part></score-partwise>`;
  return { xml, notes, breakKeys, measures: measures.length };
}

const LEVEL: Record<string, number> = { eighth: 1, '16th': 2, '32nd': 3 };
/** 박 안에서 8분·16분·32분 음을 빔으로 묶기 (음마다 빔 단계별 상태) */
function beamPlan(notes: BuiltNote[]): string[][] {
  const out: string[][] = notes.map(() => []);
  let pos = 0, group: number[] = [];
  const close = () => {
    if (group.length >= 2) {
      const lv = group.map((g) => LEVEL[TYPES[notes[g].dur][0]]);
      for (let L = 1; L <= 3; L++) {
        let j = 0;
        while (j < group.length) {
          if (lv[j] < L) { j++; continue; }
          let e = j; while (e + 1 < group.length && lv[e + 1] >= L) e++;
          if (e > j) for (let q = j; q <= e; q++) out[group[q]].push(q === j ? 'begin' : q === e ? 'end' : 'continue');
          else if (L > 1) out[group[j]].push(j === 0 ? 'forward hook' : 'backward hook');
          j = e + 1;
        }
      }
    }
    group = [];
  };
  notes.forEach((n, i) => {
    if (pos % DIV === 0) close();
    const t = TYPES[n.dur];
    if (n.p && t && LEVEL[t[0]] && Math.floor(pos / DIV) === Math.floor((pos + n.dur - 1) / DIV)) group.push(i);
    else close();
    pos += n.dur;
  });
  close();
  return out;
}

function wrapMeasure(num: number, body: string[], first: boolean, o: { key: Key; tempo?: number; beats?: number }): string {
  const attr = first
    ? `<attributes><divisions>${DIV}</divisions><key><fifths>${o.key.fifths}</fifths><mode>${o.key.mode}</mode></key><time><beats>${o.beats ?? 4}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` +
      (o.tempo ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${o.tempo}</per-minute></metronome></direction-type><sound tempo="${o.tempo}"/></direction>` : '')
    : '';
  return `<measure number="${num}">${attr}${body.join('')}</measure>`;
}

export function build(o: BuildOptions): Built {
  const notes = arrange(o);
  return toMusicXML(o, notes);
}
export const describe = (notes: BuiltNote[]) => notes.filter((n) => n.p && n.tie !== 'stop' && n.tie !== 'both').map((n) => pitchName(n.p!)).join(' ');
