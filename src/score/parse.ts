/** MusicXML(압축 안 된 .musicxml/.xml) → 마디별 음 목록. 첫 번째 파트, 화음은 가장 높은 음만 */
/** 연주 표현 (재생에 씀). slurNext = 다음 음까지 이음줄이 이어짐 (혀로 끊지 않음) */
export interface Art {
  stacc?: boolean;
  accent?: boolean;
  tenuto?: boolean;
  fermata?: boolean;
  slurNext?: boolean;
  /** 이 음부터의 셈여림 (pp p mp mf f ff …) */
  dyn?: string;
  /** 이 음에서 크레셴도·디미누엔도 시작 / 끝 */
  wedge?: 'cresc' | 'dim' | 'stop';
  /** 이 음부터 rit.(점점 느리게) / a tempo(원래 빠르기로) */
  tempo?: 'rit' | 'atempo';
  /** 꾸밈 (트릴·모르덴트·턴) — 재생 때만. upper/lower 는 조성 안의 위·아래 이웃음 */
  orn?: { kind: 'trill' | 'mordent' | 'invmordent' | 'turn'; upper: number; lower: number };
  /** 앞에 붙은 꾸밈음 (재생 때만, 채점 안 함) */
  grace?: number[];
}
export interface ScoreNote { measure: number; index: number; midi: number; beat: number; dur: number; art?: Art }
export interface ParsedScore {
  title: string;
  measures: number[];
  notes: ScoreNote[];
  /** 마디 길이 (4분음표 단위). 못갖춘마디는 실제 길이 */
  measureLen: Map<number, number>;
  /** 박자표 [박 수, 음표] (첫 마디 기준) */
  time: [number, number];
  /** 파트 이름들 (여러 파트 악보) */
  parts: string[];
  /** 이 파트의 이조 표시 (악보음 + transpose = 실음, 반음). 없으면 0. B♭ 클라리넷 파트는 -2 */
  transpose: number;
  /** 도돌이표·N번 괄호 (있는 마디만 값이 있음). measures 와 같은 순서 */
  bars: Bar[];
  /** 악보에 적힌 처음 템포 (4분음표 기준 BPM, <sound tempo>), 없으면 undefined */
  tempo?: number;
}
/** 마디의 도돌이표 정보. ending = 몇 번째에 연주하는 괄호인지 (1번 괄호 [1], 2번 괄호 [2]) */
export interface Bar { num: number; forward?: boolean; backward?: boolean; times?: number; ending?: number[] }
export interface ParseOptions {
  /** 몇 번째 파트 (0부터) */
  part?: number;
  /** 반주용: 모든 성부·화음의 모든 음 */
  allNotes?: boolean;
  /** 음 고치기용: 음마다 MusicXML 요소를 함께 돌려줌 (그 파트 1성부) */
  track?: boolean;
}
/** track 결과: notes[i] 를 만든 note 요소, 붙임줄로 이어진 뒤 요소들 */
export interface TrackedScore extends ParsedScore { doc: Document; els: Element[]; ties: Element[][] }

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 조표(fifths)의 장음계 음 높이 모음 */
function scalePcs(fifths: number): Set<number> {
  const tonic = (((7 * fifths) % 12) + 12) % 12;
  return new Set([0, 2, 4, 5, 7, 9, 11].map((x) => (x + tonic) % 12));
}
/** 트릴 등의 위·아래 이웃음 (조성 안에서) */
export function neighbors(midi: number, fifths: number) {
  const sc = scalePcs(fifths);
  let up = midi + 1; while (!sc.has(up % 12) && up < midi + 2) up++;
  let lo = midi - 1; while (!sc.has(((lo % 12) + 12) % 12) && lo > midi - 2) lo--;
  return { upper: up, lower: lo };
}

export function parseMusicXML(xml: string, opt: ParseOptions = {}): ParsedScore {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('MusicXML 파일을 읽을 수 없어요.');
  return parseDoc(doc, opt);
}
/** 음 고치기용: 음마다 요소를 함께 */
export function parseTracked(xml: string, part = 0): TrackedScore {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('MusicXML 파일을 읽을 수 없어요.');
  return parseDoc(doc, { track: true, part }) as TrackedScore;
}

function parseDoc(doc: Document, opt: ParseOptions): ParsedScore {
  const root = doc.documentElement;
  if (root.nodeName !== 'score-partwise') throw new Error('score-partwise 형식의 MusicXML만 지원해요.');
  const text = (el: Element | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  const title = text(root, 'work-title') || text(root, 'movement-title') || '악보';
  const partEls = Array.from(root.getElementsByTagName('part'));
  const names = new Map(Array.from(root.getElementsByTagName('score-part')).map((sp) => [sp.getAttribute('id'), text(sp, 'part-name')]));
  const parts = partEls.map((p, i) => names.get(p.getAttribute('id')) || `파트 ${i + 1}`);
  const part = partEls[Math.min(opt.part ?? 0, partEls.length - 1)];
  if (!part) throw new Error('파트가 없어요.');
  const all = !!opt.allNotes;
  const track = !!opt.track && !all;
  const els: Element[] = [];
  const tieEls: Element[][] = [];
  let fifths = 0;
  let pendingGrace: number[] = [];
  const midiOf = (p: Element) => 12 * (Number(text(p, 'octave')) + 1) + STEP[text(p, 'step')] + Number(text(p, 'alter') || '0');
  const tr = part.getElementsByTagName('transpose')[0];
  const transpose = tr ? (Number(text(tr, 'chromatic')) || 0) + 12 * (Number(text(tr, 'octave-change')) || 0) : 0;
  // 붙임줄: 앞 음이 tie start 이고 이번 음이 tie stop 이면 앞 음을 늘림
  let tieOpen = false;
  let contAt: number | null = null; // 이어지는 음(화음 포함)의 시작 위치
  const openTies = new Map<string, ScoreNote>(); // 반주용: "성부:midi" → 이어질 음
  let divisions = 1;
  const notes: ScoreNote[] = [];
  const measures: number[] = [];
  const measureLen = new Map<number, number>();
  // 연주 표현: 지시(셈여림·쐐기·rit.)는 다음 음에 붙이고, 이음줄은 열려 있는 동안 slurNext
  let pend: Art = {};
  let slurOpen = false;
  const DYN = new Set(['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sf', 'sfz', 'fp', 'rf', 'rfz']);
  const readDirection = (el: Element) => {
    for (const d of Array.from(el.getElementsByTagName('dynamics'))) {
      const k = Array.from(d.children).map((c) => c.nodeName).find((n) => DYN.has(n));
      if (k) pend.dyn = k;
    }
    for (const w of Array.from(el.getElementsByTagName('wedge'))) {
      const t = w.getAttribute('type');
      pend.wedge = t === 'crescendo' ? 'cresc' : t === 'diminuendo' ? 'dim' : 'stop';
    }
    for (const w of Array.from(el.getElementsByTagName('words'))) {
      const t = (w.textContent ?? '').trim().toLowerCase();
      if (/^(rit|rall|ritard|riten|allarg)/.test(t)) pend.tempo = 'rit';
      else if (/^(a tempo|tempo i|tempo primo)/.test(t)) pend.tempo = 'atempo';
      else if (/^(cresc)/.test(t)) pend.wedge = 'cresc';
      else if (/^(dim|decresc)/.test(t)) pend.wedge = 'dim';
    }
  };
  /** 음표 하나의 아티큘레이션·이음줄·늘임표 */
  const readNotations = (el: Element, a: Art) => {
    const has = (tag: string) => el.getElementsByTagName(tag).length > 0;
    if (has('staccato') || has('staccatissimo') || has('spiccato')) a.stacc = true;
    if (has('accent') || has('strong-accent')) a.accent = true;
    if (has('tenuto') || has('detached-legato')) a.tenuto = true;
    if (has('fermata')) a.fermata = true;
    const slurs = Array.from(el.getElementsByTagName('slur')).map((x) => x.getAttribute('type'));
    if (slurs.includes('stop')) slurOpen = false;
    if (slurs.includes('start')) slurOpen = true;
  };
  const takePend = (a: Art) => { Object.assign(a, pend); pend = {}; };
  let time: [number, number] = [4, 4];
  let nominal = 4;
  const bars: Bar[] = [];
  let ending: number[] | null = null;
  for (const m of Array.from(part.children).filter((c) => c.nodeName === 'measure')) {
    // 못갖춘마디 0 도 그대로 (0 을 거짓으로 보면 1번 마디와 겹침). 번호가 없거나 겹치면 앞 번호 + 1
    const raw = (m.getAttribute('number') ?? '').trim();
    const n0 = raw === '' ? NaN : Number(raw);
    const num = Number.isFinite(n0) && !measures.includes(n0) ? n0 : measures.length ? measures[measures.length - 1] + 1 : 1;
    measures.push(num);
    let pos = 0; // 4분음표 단위
    let lastStart = 0;
    let maxPos = 0;
    const bar: Bar = { num };
    bars.push(bar);
    for (const bl of Array.from(m.children).filter((c) => c.nodeName === 'barline')) {
      const rep = bl.getElementsByTagName('repeat')[0];
      if (rep?.getAttribute('direction') === 'forward') bar.forward = true;
      if (rep?.getAttribute('direction') === 'backward') { bar.backward = true; const t = Number(rep.getAttribute('times')); if (t > 1) bar.times = t; }
      const en = bl.getElementsByTagName('ending')[0];
      if (en) {
        const type = en.getAttribute('type');
        if (type === 'start') ending = (en.getAttribute('number') ?? '1').split(/[,\s]+/).map(Number).filter((x) => x > 0);
        if (ending) bar.ending = ending;
        if (type === 'stop' || type === 'discontinue') ending = null;
      } else if (ending) bar.ending = ending;
    }
    if (ending && !bar.ending) bar.ending = ending;
    for (const el of Array.from(m.children)) {
      if (el.nodeName === 'attributes') {
        const d = text(el, 'divisions');
        if (d) divisions = Number(d);
        const f = text(el, 'fifths');
        if (f) fifths = Number(f);
        const b = text(el, 'beats'), bt = text(el, 'beat-type');
        if (b && bt) { if (measures.length === 1) time = [Number(b), Number(bt)]; nominal = (Number(b) * 4) / Number(bt); }
        continue;
      }
      if (el.nodeName === 'direction') { if (!all) readDirection(el); continue; }
      if (el.nodeName === 'backup') { pos -= Number(text(el, 'duration')) / divisions; continue; }
      if (el.nodeName === 'forward') { pos += Number(text(el, 'duration')) / divisions; maxPos = Math.max(maxPos, pos); continue; }
      if (el.nodeName !== 'note') continue;
      const voice = text(el, 'voice') || '1';
      if (el.getElementsByTagName('grace').length) {
        // 꾸밈음: 채점에서는 빼고, 다음 음 앞에서 짧게 재생
        const gp = el.getElementsByTagName('pitch')[0];
        if (gp && !all && voice === '1' && !el.getElementsByTagName('chord').length) pendingGrace.push(midiOf(gp));
        continue;
      }
      const isChord = el.getElementsByTagName('chord').length > 0;
      const dur = Number(text(el, 'duration') || '0') / divisions;
      const start = isChord ? lastStart : pos;
      if (!isChord) { lastStart = pos; pos += dur; maxPos = Math.max(maxPos, pos); }
      if (voice !== '1' && !all) continue;
      if (el.getElementsByTagName('rest').length) continue;
      const p = el.getElementsByTagName('pitch')[0];
      if (!p) continue;
      const midi = midiOf(p);
      const ties = Array.from(el.getElementsByTagName('tie')).map((t) => t.getAttribute('type'));
      const tieStop = ties.includes('stop'), tieStart = ties.includes('start');
      if (all) {
        const key = `${voice}:${midi}`;
        const prevT = openTies.get(key);
        if (tieStop && prevT) { prevT.dur += dur; if (!tieStart) openTies.delete(key); continue; }
        const nn: ScoreNote = { measure: num, index: 0, midi, beat: start, dur };
        notes.push(nn);
        if (tieStart) openTies.set(key, nn);
        continue;
      }
      const prev = notes[notes.length - 1];
      // 붙임줄로 이어지는 음: 앞 음 길이에 더하고 따로 세지 않음
      if (isChord && contAt === start) continue;
      // 화음이면 모든 음이 붙임줄로 이어질 때만 (OSMD 그림과 같은 기준)
      const groupStop = () => {
        let ok = tieStop;
        for (let sib = el.nextElementSibling; ok && sib && sib.nodeName === 'note' && sib.getElementsByTagName('chord').length; sib = sib.nextElementSibling) {
          if (!Array.from(sib.getElementsByTagName('tie')).some((t) => t.getAttribute('type') === 'stop')) ok = false;
        }
        return ok;
      };
      if (!isChord && tieOpen && prev && groupStop()) {
        prev.dur += dur;
        if (track) tieEls[tieEls.length - 1].push(el);
        // 붙임줄 끝 음의 이음줄·늘임표는 앞 음에
        const a = prev.art ?? (prev.art = {});
        readNotations(el, a);
        a.slurNext = slurOpen;
        contAt = start;
        tieOpen = tieStart;
        continue;
      }
      if (!isChord) { contAt = null; tieOpen = tieStart; } else if (tieStart) tieOpen = true;
      if (isChord && prev && prev.measure === num && prev.beat === start) {
        if (midi > prev.midi) { prev.midi = midi; if (track) els[els.length - 1] = el; } // 화음은 가장 높은 음으로 채점
        continue;
      }
      const art: Art = {};
      takePend(art);
      readNotations(el, art);
      art.slurNext = slurOpen;
      const has = (tag: string) => el.getElementsByTagName(tag).length > 0;
      const kind = has('trill-mark') ? 'trill' : has('inverted-mordent') ? 'invmordent' : has('mordent') ? 'mordent' : has('turn') ? 'turn' : null;
      if (kind) art.orn = { kind, ...neighbors(midi, fifths) };
      if (pendingGrace.length) { art.grace = pendingGrace; pendingGrace = []; }
      notes.push({ measure: num, index: 0, midi, beat: start, dur, art });
      if (track) { els.push(el); tieEls.push([]); }
    }
    const whole = Array.from(m.getElementsByTagName('rest')).some((r) => r.getAttribute('measure') === 'yes');
    measureLen.set(num, whole || maxPos === 0 ? nominal : m.getAttribute('implicit') === 'yes' ? maxPos : Math.max(maxPos, nominal));
  }
  // 마지막 음 뒤에 남은 지시(쐐기 끝 등)는 마지막 음에
  if (!all && notes.length && (pend.dyn || pend.wedge || pend.tempo)) Object.assign(notes[notes.length - 1].art ?? (notes[notes.length - 1].art = {}), pend);
  if (!all && notes.length) { const l = notes[notes.length - 1].art; if (l) l.slurNext = false; }
  // 마디 안 순서 번호
  let cur = -1, k = 0;
  for (const n of notes) { if (n.measure !== cur) { cur = n.measure; k = 0; } n.index = k++; }
  if (all) notes.sort((a, b) => a.measure - b.measure || a.beat - b.beat);
  const snd = Array.from(root.getElementsByTagName('sound')).find((e) => e.getAttribute('tempo'));
  const tq = snd ? Number(snd.getAttribute('tempo')) : NaN;
  const res: ParsedScore = {
    title, measures, notes, measureLen, time, parts, transpose, bars: bars.some((b) => b.forward || b.backward || b.ending) ? bars : [],
    ...(Number.isFinite(tq) && tq >= 20 && tq <= 300 ? { tempo: Math.round(tq) } : {}),
  };
  return track ? ({ ...res, doc, els, ties: tieEls } as TrackedScore) : res;
}

/** 도돌이표가 있는지 */
export const hasRepeats = (s: ParsedScore) => s.bars.some((b) => b.backward);

/**
 * 도돌이표대로 펼친 마디 순서 (마디 번호). 도돌이표가 없으면 measures 그대로.
 * 1·2번 괄호, 여러 번 반복(times), 도돌이 시작 표가 없으면 처음부터.
 */
export function playOrder(s: ParsedScore): number[] {
  if (!s.bars.length) return [...s.measures];
  const bars = s.bars;
  const out: number[] = [];
  let i = 0, startIdx = 0, pass = 1, guard = 0;
  const jumps = new Map<number, number>();
  while (i < bars.length && guard++ < 10000) {
    const b = bars[i];
    if (b.forward && startIdx !== i) { startIdx = i; pass = 1; }
    if (b.ending && !b.ending.includes(pass)) { i++; continue; }
    out.push(b.num);
    if (b.backward) {
      const done = jumps.get(i) ?? 0;
      // 괄호 안의 도돌이표는 그 괄호를 칠 때마다, 아니면 times 번
      const again = b.ending ? done < 8 : done < (b.times ?? 2) - 1;
      if (again) { jumps.set(i, done + 1); pass++; i = startIdx; continue; }
      startIdx = i + 1; pass = 1;
    } else if (b.ending && !bars[i + 1]?.ending) {
      // 마지막 괄호를 지나면 반복 끝
      startIdx = i + 1; pass = 1;
    }
    i++;
  }
  return out;
}

export function notesInRange(s: ParsedScore, from: number, to: number): ScoreNote[] {
  return s.notes.filter((n) => n.measure >= from && n.measure <= to);
}
