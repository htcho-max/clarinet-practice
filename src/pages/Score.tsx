import { useToday } from '../state/useToday';
import { P } from '../instruments/profiles';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { db, loadScoreList, type ScoreFile, type ScoreMeta } from '../data/db';
import { sortAcc } from '../score/accidentals';
import { parseMusicXML, notesInRange, playOrder, hasRepeats, type ParsedScore } from '../score/parse';
import { measureStats, reviewChanges, reviewMessage, noteCentsOf, ladderVerdict, LADDER_STEP } from '../data/review';
import { currentGearId, useReviews } from '../state/useGear';
import { GearPicker } from '../components/GearPicker';
import { alignNotes, summarizeScore, type Played, type Scored } from '../score/align';
import { createOSMD, colorNotes, noteElements, showParts, setDrawRange, paintNotes } from '../score/osmd';
import { planPlayback, scorePlayer, slicePlan, instFor, type Voice, type AccPart } from '../score/player';
import { analyzeRhythm, rhythmTone } from '../score/rhythm';
import { NoteSegmenter, equalRef } from '../audio/segment';
import { pitchTracker } from '../audio/pitchTracker';
import { midiName, prettyName } from '../audio/notes';
import { centsText } from '../components/CentsGauge';
import { LivePitch } from '../components/LivePitch';
import { tolFor, toneOf, TOLERANCES, type Tolerance, type ToleranceId } from '../score/tolerance';
import { NumField } from '../components/NumField';
import { usePieces } from '../state/usePieces';
import { bookLabel } from '../data/pieces';
import { usePitch } from '../state/usePitch';
import { useSettings } from '../state/settings';
import { useWakeLock } from '../state/wakeLock';
import { useSession } from '../state/session';
import { useBackLayer } from '../state/back';
import { recorder } from '../audio/recorder';
import { localDate, clock } from '../data/dates';
import { useScoreRuns, runText } from '../state/useScoreRuns';
import type { ScoreRun, Recording } from '../data/db';
import { Exercises, createExercise, createArt, loadOpts, recordProgress, takePending } from './Exercises';
import { ART_VARIANTS } from '../exercise/articulation';
import { STEPS } from '../exercise/curriculum';
import { editNote, revertMeasure, type EditOp, type NoteType } from '../score/edit';
import { toRunNotes, fromRunNotes, meanDb } from '../score/practice';
import { LessonNotesCard, LessonChecklist, useLessonNotes } from '../components/LessonNotes';
import { ScoreProgress } from '../components/ScoreProgress';
import { DynChart } from '../components/DynChart';
import { RunInsightView } from '../components/RunInsight';
import { takeScoreRequest, type ScoreOpenRequest } from '../state/openRequest';
import { useFolders, guessFolder, folderForBook, addFolder, renameFolder, deleteFolder, moveFolder, moveScore } from '../data/folders';

/** 악보 목록 (XML 없이, 최근 순) */
function useScores(): ScoreMeta[] {
  const [rows, setRows] = useState<ScoreMeta[]>([]);
  useEffect(() => {
    const sub = liveQuery(loadScoreList).subscribe({ next: setRows, error: () => {} });
    return () => sub.unsubscribe();
  }, []);
  return rows;
}
/** 연 악보 하나만 통째로 (XML 포함) */
function useScoreFile(id: number | null): ScoreFile | null | undefined {
  const [row, setRow] = useState<ScoreFile | null | undefined>(id === null ? null : undefined);
  useEffect(() => {
    if (id === null) { setRow(null); return; }
    setRow(undefined);
    const sub = liveQuery(() => db.scores.get(id)).subscribe({ next: (r) => setRow(r ?? null), error: () => setRow(null) });
    return () => sub.unsubscribe();
  }, [id]);
  return row;
}

const COLOR = { good: '#15803d', warn: '#ca8a04', bad: '#dc2626', wrong: '#7c3aed', missed: '#9ca3af' };
/** 음표 색 (판정 기준 t 를 따름) */
const colorWith = (r: Scored, t: Tolerance) => r.status === 'missed' ? COLOR.missed : r.status === 'wrong' ? COLOR.wrong : COLOR[toneOf(r.cents!, t)];
const toneWith = (c: number | null, t: Tolerance) => (c === null ? '' : toneOf(c, t));

export function Score() {
  const scores = useScores();
  const pieces = usePieces();
  const folders = useFolders();
  const [openId, setOpenId] = useState<number | null>(null);
  const [exView, setExView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pieceForNew, setPieceForNew] = useState('');
  const [filter, setFilter] = useState<string>(() => { try { return localStorage.getItem('clarinet-score-folder') || 'all'; } catch { return 'all'; } });
  const [manage, setManage] = useState(false);
  useEffect(() => { try { localStorage.setItem('clarinet-score-folder', filter); } catch { /* 무시 */ } }, [filter]);
  const file = useRef<HTMLInputElement>(null);
  const openFile = useScoreFile(openId);
  const open = openFile ?? null;
  // 오늘의 연습에서 연습곡을 바로 열기
  useEffect(() => { const p = takePending(); if (p) p.fn().then((id) => { setExView(p.exercises); setOpenId(id); }).catch(() => {}); }, []);
  // 기록 화면에서 지난 기록을 악보에 보이며 열기
  const [openReq, setOpenReq] = useState<ScoreOpenRequest | null>(null);
  useEffect(() => { const r = takeScoreRequest(); if (r) { setOpenReq(r); setOpenId(r.scoreId); } }, []);
  const folderName = (id?: string) => folders.find((f) => f.id === id)?.name ?? '분류 안 됨';

  async function importFile(f: File) {
    setError(null);
    try {
      if (/\.mxl$/i.test(f.name)) throw new Error('압축된 .mxl 은 아직 못 읽어요. MuseScore 등에서 "MusicXML(.musicxml)"로 내보내 주세요.');
      const xml = await f.text();
      const parsed = parseMusicXML(xml);
      if (!parsed.notes.length) throw new Error('음표가 없는 악보예요.');
      const piece = pieces.find((p) => p.id === pieceForNew);
      // 폴더: 고른 폴더 > 연결한 곡의 분류 > 제목으로 짐작
      const folder = filter !== 'all' && filter !== 'none' ? filter
        : piece ? await folderForBook(piece.book)
        : guessFolder(parsed.title, undefined, new Map([1, 2, 3, 4].map((b) => [b, pieces.filter((p) => p.book === b).map((p) => p.title)])));
      if (folder.startsWith('book-')) await folderForBook(Number(folder.split('-')[1]));
      const id = await db.scores.add({ title: parsed.title, xml, pieceId: pieceForNew || undefined, folder, createdAt: Date.now() });
      setOpenId(id);
    } catch (e) {
      setError((e as Error).message || '악보를 불러오지 못했어요.');
    } finally {
      if (file.current) file.current.value = '';
    }
  }

  // 연습곡 화면 층이 먼저 (악보가 그 위에)
  useBackLayer(exView, () => setExView(false));
  useBackLayer(!!open, () => { const o = open; setOpenId(null); setExView(!!o?.exercise); });
  if (openId !== null && openFile === undefined) return <section className="page score"><p className="muted">악보를 여는 중…</p></section>;
  if (open) return <ScoreView key={`${open.id}:${open.createdAt}`} score={open} initial={openReq && openReq.scoreId === open.id ? openReq : undefined} onClose={() => { setOpenId(null); setOpenReq(null); setExView(!!open.exercise); }} />;
  if (exView) return <Exercises onOpen={(id) => { setOpenId(id); }} onBack={() => setExView(false)} />;
  const mine = scores.filter((s) => !s.exercise);
  const known = new Set(folders.map((f) => f.id));
  const inFolder = (id: string | 'none') => mine.filter((s) => (id === 'none' ? !s.folder || !known.has(s.folder) : s.folder === id));
  const unsorted = inFolder('none');
  const groups: { id: string; name: string; list: ScoreMeta[] }[] = filter === 'all'
    ? [...folders.map((f) => ({ id: f.id, name: f.name, list: inFolder(f.id) })).filter((g) => g.list.length > 0), ...(unsorted.length ? [{ id: 'none', name: '분류 안 됨', list: unsorted }] : [])]
    : [{ id: filter, name: filter === 'none' ? '분류 안 됨' : folderName(filter), list: inFolder(filter) }];
  const current = folders.find((f) => f.id === filter);

  async function newFolder() {
    const name = prompt('새 폴더 이름', '');
    if (name?.trim()) setFilter(await addFolder(name));
  }

  return (
    <section className="page score">
      <div className="card">
        <b>연습곡 · 쉬운 곡</b>
        <p className="hint">{P.exerciseIntro}</p>
        <button className="primary wide" onClick={() => setExView(true)} data-testid="open-exercises">연습곡 만들기</button>
      </div>

      <div className="card">
        <div className="card-head">
          <b>내 악보 {mine.length}개</b>
          <button className="mini" onClick={() => setManage((m) => !m)} data-testid="folder-manage">{manage ? '완료' : '폴더 관리'}</button>
        </div>
        <div className="chips" data-testid="folder-chips">
          <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>전체 {mine.length}</button>
          {folders.map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.name} {inFolder(f.id).length}</button>
          ))}
          {unsorted.length > 0 && <button className={`chip ${filter === 'none' ? 'on' : ''}`} onClick={() => setFilter('none')}>분류 안 됨 {unsorted.length}</button>}
        </div>
        {manage && (
          <div className="folder-manage">
            <button className="secondary wide" onClick={newFolder} data-testid="folder-add">+ 새 폴더</button>
            {current ? (
              <div className="session-controls">
                <button onClick={async () => { const n = prompt('폴더 이름', current.name); if (n?.trim()) renameFolder(current.id, n); }}>이름 바꾸기</button>
                <button onClick={() => moveFolder(current.id, -1)} aria-label="앞으로">◀</button>
                <button onClick={() => moveFolder(current.id, 1)} aria-label="뒤로">▶</button>
                <button className="danger" onClick={() => { if (confirm(`"${current.name}" 폴더를 지울까요? 안의 악보는 지우지 않고 "분류 안 됨"으로 옮겨요.`)) { deleteFolder(current.id); setFilter('all'); } }}>폴더 지우기</button>
              </div>
            ) : <p className="hint">폴더를 하나 고르면 이름 바꾸기·순서·지우기를 할 수 있어요.</p>}
          </div>
        )}
        {filter === 'all' && mine.length === 0 && <p className="muted small">아직 없어요.</p>}
        {groups.map((g) => (
          <div key={g.id} className="folder-group" data-testid={`folder-${g.id}`}>
            {filter === 'all' && <div className="folder-title">{g.name} <span className="muted small">{g.list.length}</span></div>}
            {g.list.length === 0 && <p className="muted small">이 폴더에는 아직 악보가 없어요. 아래에서 불러오면 이 폴더에 들어가요.</p>}
            <ul className="rec-list">
              {g.list.map((s) => (
                <li key={s.id}>
                  <div className="rec-head">
                    <button className="link rec-title" onClick={() => setOpenId(s.id!)} data-testid="score-open">
                      <b>{s.title}</b>
                      <span className="muted small">{pieces.find((p) => p.id === s.pieceId)?.title ?? '곡 연결 없음'} · {new Date(s.createdAt).toLocaleDateString('ko-KR')}</span>
                    </button>
                    <select className="mini-select" value={s.folder && known.has(s.folder) ? s.folder : ''} onChange={(e) => moveScore(s.id!, e.target.value || undefined)} aria-label="폴더 옮기기" data-testid="score-folder">
                      <option value="">분류 안 됨</option>
                      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button className="mini danger" onClick={() => { if (confirm('이 악보를 지울까요? (복습함의 이 악보 마디도 지워요)')) { db.scores.delete(s.id!); db.reviews.where('scoreId').equals(s.id!).delete(); } }} aria-label="악보 삭제">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <b>악보 불러오기{filter !== 'all' && filter !== 'none' ? ` → ${folderName(filter)}` : ''}</b>
        <p className="hint">
          MusicXML 파일(.musicxml, .xml)을 고르세요. 악보는 <b>이 기기 안에만</b> 저장되고, 앱이나 GitHub에는 올라가지 않아요.
          (교재 악보는 저작권이 있어서 개인 연습용으로만 쓰세요.) 폴더를 골라 두면 그 폴더에 들어가고, 전체일 때는 연결한 곡의 분류나 제목으로 나눠 넣어요. {P.id === 'clarinet' ? 'B♭ 클라리넷 파트 악보(악보음)를 쓰세요.' : '플룻 파트 악보를 쓰세요.'}
        </p>
        <select value={pieceForNew} onChange={(e) => setPieceForNew(e.target.value)} aria-label="연결할 곡">
          <option value="">곡 연결 안 함</option>
          {pieces.map((p) => <option key={p.id} value={p.id}>{bookLabel(p.book)} · {p.title}</option>)}
        </select>
        <input ref={file} type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,text/xml" hidden
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} data-testid="score-file" />
        <button className="primary wide" onClick={() => file.current?.click()}>파일에서 악보 불러오기</button>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}

function ScoreView({ score, onClose, initial }: { score: ScoreFile; onClose: () => void; initial?: ScoreOpenRequest }) {
  const { settings, update: updateSettings } = useSettings();
  // 음정 판정 기준 (엄격·보통·관대): 음표 색·▲▼·지금 내는 음·복습함·템포 사다리
  const tol = tolFor(settings.pitchTolerance);
  const colorFor = (r: Scored) => colorWith(r, tol);
  const tone = (c: number | null) => toneWith(c, tol);
  const pieces = usePieces();
  const piece = pieces.find((p) => p.id === score.pieceId);
  const myPart = score.part ?? 0;
  const parsed: ParsedScore = useMemo(() => parseMusicXML(score.xml, { part: myPart }), [score.xml, myPart]);
  const accParts: AccPart[] = useMemo(() => {
    const out: AccPart[] = [];
    parsed.parts.forEach((name, i) => { if (i !== myPart) { try { out.push({ score: parseMusicXML(score.xml, { part: i, allNotes: true }), inst: instFor(name) }); } catch { /* 무시 */ } } });
    if (score.accXml) {
      try {
        const head = parseMusicXML(score.accXml);
        head.parts.forEach((name, i) => out.push({ score: parseMusicXML(score.accXml!, { part: i, allNotes: true }), inst: instFor(name) }));
      } catch { /* 무시 */ }
    }
    return out;
  }, [score.xml, score.accXml, parsed, myPart]);
  const hasAcc = accParts.length > 0;
  const [accOn, setAccOn] = useState(true);
  const [mute, setMute] = useState(false);
  const [scoreWithAcc, setScoreWithAcc] = useState(false);
  const [view, setView] = useState<'pitch' | 'rhythm' | 'dyn'>('pitch');
  const accFile = useRef<HTMLInputElement>(null);
  const [accError, setAccError] = useState<string | null>(null);
  async function attachAcc(f: File) {
    setAccError(null);
    try {
      const x = await f.text();
      const p = parseMusicXML(x, { allNotes: true });
      if (!p.notes.length) throw new Error('음표가 없는 악보예요.');
      await db.scores.update(score.id!, { accXml: x, accName: f.name.replace(/\.(musicxml|xml)$/i, '') });
    } catch (e) { setAccError((e as Error).message); } finally { if (accFile.current) accFile.current.value = ''; }
  }
  const first = parsed.measures[0] ?? 1, last = parsed.measures[parsed.measures.length - 1] ?? 1;
  const firstNoteMeasure = parsed.notes[0]?.measure ?? first;
  const [from, setFrom] = useState(score.lastFrom ?? firstNoteMeasure);
  const [to, setTo] = useState(score.lastTo ?? (score.exercise ? last : Math.min(last, (score.lastFrom ?? firstNoteMeasure) + 3)));
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const pitch = usePitch(settings.minDb, { reading: false });
  const [listening, setListening] = useState(false);
  const played = useRef<Played[]>([]);
  const [, tick] = useState(0);
  const [result, setResult] = useState<Scored[] | null>(null);
  /** 지난 연습 기록을 다시 보는 중이면 그 기록 */
  const [pastRun, setPastRun] = useState<ScoreRun | null>(null);
  const resultCard = useRef<HTMLDivElement>(null);
  /** 음표를 누르면: 그 마디부터(기본) / 음 고치기 */
  const [tool, setTool] = useState<'none' | 'edit'>('none');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState('');
  const lessonNotes = useLessonNotes(score.id);
  const dbTrack = useRef<[number, number][]>([]);
  const loadedXml = useRef<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const els = useRef<Map<string, string[]>>(new Map());
  const lit = useRef<SVGGElement[]>([]);
  const litKey = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playBpm, setPlayBpm] = useState(72);
  const [withClick, setWithClick] = useState(false);
  /** 채점할 때 박자: 끔 / 깜빡임만 / 소리 */
  const [scoreMetro, setScoreMetroS] = useState<'off' | 'visual' | 'sound'>(() => { try { const v = localStorage.getItem('clarinet-score-metro'); return v === 'visual' || v === 'sound' ? v : 'off'; } catch { return 'off'; } });
  const setScoreMetro = (v: 'off' | 'visual' | 'sound') => { setScoreMetroS(v); try { localStorage.setItem('clarinet-score-metro', v); } catch { /* 무시 */ } };
  /** 채점 중 지금 내는 음 (튜너보다 천천히) */
  const [livePitch, setLivePitchS] = useState<boolean>(() => { try { return localStorage.getItem('clarinet-score-live-pitch') !== '0'; } catch { return true; } });
  const setLivePitch = (v: boolean) => { setLivePitchS(v); try { localStorage.setItem('clarinet-score-live-pitch', v ? '1' : '0'); } catch { /* 무시 */ } };
  const beatDot = useRef<HTMLSpanElement | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBeat = (_k: number, accent: boolean) => {
    const el = beatDot.current; if (!el) return;
    el.classList.remove('on', 'accent'); void el.offsetWidth; el.classList.add('on'); if (accent) el.classList.add('accent');
    if (beatTimer.current) clearTimeout(beatTimer.current);
    beatTimer.current = setTimeout(() => el.classList.remove('on', 'accent'), 140);
  };
  const [countIn, setCountIn] = useState(true);
  const [loop, setLoop] = useState(false);
  // 악보의 셈여림·스타카토·이음줄·늘임표·rit. 을 살려서 재생
  const [expressive, setExpressive] = useState(() => { try { return localStorage.getItem('clarinet-expressive') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('clarinet-expressive', expressive ? '1' : '0'); } catch { /* 무시 */ } }, [expressive]);
  const [voice, setVoice] = useState<Voice>('sample');
  const [voiceNote, setVoiceNote] = useState('');
  const [nowMeasure, setNowMeasure] = useState<number | null>(null);
  const [lenLock, setLenLock] = useState<number | null>(null);
  /** 일시정지한 음 번호 (null 이면 일시정지 아님) */
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [focus, setFocus] = useState(() => { try { return localStorage.getItem('clarinet-score-focus') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('clarinet-score-focus', focus ? '1' : '0'); } catch { /* 무시 */ } }, [focus]);
  const [zoom, setZoom] = useState(() => { const d = typeof window !== 'undefined' && window.innerWidth >= 720 ? 1.3 : 1; try { return Number(localStorage.getItem('clarinet-score-zoom')) || d; } catch { return d; } });
  useEffect(() => { try { localStorage.setItem('clarinet-score-zoom', String(zoom)); } catch { /* 무시 */ } }, [zoom]);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  // 도돌이표대로 펼쳐서 듣기
  const repeats = useMemo(() => hasRepeats(parsed), [parsed]);
  const [unfold, setUnfold] = useState(() => { try { return localStorage.getItem('clarinet-unfold') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('clarinet-unfold', unfold ? '1' : '0'); } catch { /* 무시 */ } }, [unfold]);
  const order = useMemo(() => (repeats && unfold ? playOrder(parsed) : undefined), [parsed, repeats, unfold]);
  // 템포 사다리: 목표 템포로 한 마디 세고 채점, 통과하면 +4
  const [ladderOn, setLadderOn] = useState(() => { try { return localStorage.getItem('clarinet-ladder') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('clarinet-ladder', ladderOn ? '1' : '0'); } catch { /* 무시 */ } }, [ladderOn]);
  const [ladderMsg, setLadderMsg] = useState<{ pass: boolean; text: string } | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const reviews = useReviews(score.id);
  const todayStr = useToday();
  const dueHere = reviews.filter((r) => r.due <= todayStr).sort((a, b) => a.measure - b.measure);
  useWakeLock(listening || playing, settings.wakeLock);
  const ex = score.exercise;
  const { session } = useSession();
  const runs = useScoreRuns(score.id);
  const runStart = useRef(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [recOn, setRecOn] = useState(() => { try { return localStorage.getItem('clarinet-score-rec') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('clarinet-score-rec', recOn ? '1' : '0'); } catch { /* 무시 */ } }, [recOn]);
  const step = ex ? STEPS.find((s) => s.id === ex.stepId) : undefined;
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  useEffect(() => { if (ex) setPlayBpm(ex.tempo); }, [ex?.stepId]); // eslint-disable-line react-hooks/exhaustive-deps
  // 곡에 정한 템포 > 악보에 적힌 템포 (연습곡은 연습곡 템포)
  useEffect(() => { if (piece?.currentBpm) setPlayBpm(piece.currentBpm); else if (piece?.targetBpm) setPlayBpm(Math.round(piece.targetBpm * 0.7)); else if (parsed.tempo && !ex) setPlayBpm(parsed.tempo); }, [piece?.id, parsed.tempo]); // eslint-disable-line react-hooks/exhaustive-deps
  // 사다리를 켜면 이 악보의 사다리 템포로
  useEffect(() => { if (ladderOn && score.ladder?.bpm) setPlayBpm(score.ladder.bpm); }, [ladderOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => scorePlayer.stop(), []);

  const expected = useMemo(() => notesInRange(parsed, from, to), [parsed, from, to]);
  // 조표·임시표로 바뀐 음(♯·♭) 형광펜 표시. 익숙한 음은 칩을 눌러 빼기 (악기마다 따로 기억)
  const accKey = `clarinet-acc-hl-${P.id}`, skipKey = `clarinet-acc-skip-${P.id}`;
  const [hlOn, setHlOn] = useState(() => { try { return localStorage.getItem(accKey) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(accKey, hlOn ? '1' : '0'); } catch { /* 무시 */ } }, [hlOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const [accSkip, setAccSkip] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(skipKey) || '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(skipKey, JSON.stringify(accSkip)); } catch { /* 무시 */ } }, [accSkip]); // eslint-disable-line react-hooks/exhaustive-deps
  const accNames = useMemo(() => sortAcc([...new Set(expected.map((n) => n.acc).filter((x): x is string => !!x))]), [expected]);

  const rhythm = useMemo(() => (result ? analyzeRhythm(parsed, result) : null), [result, parsed]);
  const noteColors = useMemo(() => {
    if (!result) return new Map<string, string>();
    if (view === 'rhythm' && rhythm) {
      const errs = new Map(rhythm.notes.map((n) => [n.key, n.err]));
      return new Map(result.map((r) => {
        const k = `${r.note.measure}:${r.note.index}`;
        const e = errs.get(k);
        return [k, e === undefined ? COLOR.missed : COLOR[rhythmTone(e)]];
      }));
    }
    return new Map(result.map((r) => [`${r.note.measure}:${r.note.index}`, colorFor(r)]));
  }, [result, view, rhythm, tol.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 확대·크기 변화는 잠깐 모았다가 한 번만 다시 그리기
  const [zoomView, setZoomView] = useState(zoom);
  useEffect(() => { const id = setTimeout(() => setZoomView(zoom), 250); return () => clearTimeout(id); }, [zoom]);
  const [sizeTick, setSizeTick] = useState(0);
  useEffect(() => {
    const el = holder.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth, id: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) < 8) return; // 주소창이 나타났다 사라지는 정도는 무시
      w = el.clientWidth;
      if (id) clearTimeout(id);
      id = setTimeout(() => setSizeTick((x) => x + 1), 300);
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (id) clearTimeout(id); };
  }, []);
  const osmdInit = useRef<Promise<void> | null>(null);
  useEffect(() => () => { try { osmd.current?.clear(); } catch { /* 무시 */ } osmd.current = null; }, []);

  // 악보 그리기
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!osmdInit.current && holder.current) {
          const el = holder.current;
          osmdInit.current = (async () => { const o = await createOSMD(el); await o.load(score.xml); loadedXml.current = score.xml; osmd.current = o; })();
        }
        await osmdInit.current;
        if (!alive || !osmd.current) return;
        // 앱에서 음을 고쳤으면 새 악보로 다시 읽기
        if (loadedXml.current !== score.xml) { const x = score.xml; await osmd.current.load(x); loadedXml.current = x; if (!alive) return; }
        setRendering(true);
        setDrawRange(osmd.current, from, to); // 못갖춘마디·중간 마디부터 시작하는 악보도 번호대로
        osmd.current.zoom = zoomView;
        if (parsed.parts.length > 1) showParts(osmd.current, myPart, !!score.showOthers);
        // 색은 그린 뒤 SVG 에 직접 칠함 (채점 결과·판정 기준만 바뀔 때 다시 그리지 않게)
        colorNotes(osmd.current, new Map(), myPart);
        osmd.current.render();
        els.current = noteElements(osmd.current, myPart);
        setRenderTick((x) => x + 1);
        lit.current = [];
        if (litKey.current) highlight(litKey.current, false); // 다시 그려도 지금 음 강조 유지
        setRenderError(null);
      } catch (e) {
        setRenderError('악보를 그리지 못했어요: ' + ((e as Error).message ?? ''));
      } finally {
        if (alive) setRendering(false);
      }
    })();
    return () => { alive = false; };
  }, [score.xml, from, to, myPart, score.showOthers, zoomView, focus, sizeTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // 음표 색: 다시 그린 뒤나 채점 결과·보기·판정 기준이 바뀔 때 칠하기만
  useEffect(() => { paintNotes(els.current, noteColors, holder.current ?? document); }, [noteColors, renderTick]);

  /** 음표 자리: 머리(가로 위치·누르기)와 기둥까지 포함한 위·아래 */
  const sheetWrap = useRef<HTMLDivElement>(null);
  const noteRect = (key: string): { left: number; right: number; top: number; bottom: number } | null => {
    const ids = els.current.get(key) ?? [];
    for (const id of ids) { // 붙임줄 뒤 음은 빼고 첫 음만
      const el = document.getElementById(id) ?? document.getElementById(`vf-${id}`);
      if (!el) continue;
      const g = el.getBoundingClientRect();
      if (!(g.width || g.height)) continue;
      const heads = Array.from(el.querySelectorAll('.vf-notehead')).map((h) => h.getBoundingClientRect()).filter((r) => r.width || r.height);
      return heads.length ? { left: Math.min(...heads.map((h) => h.left)), right: Math.max(...heads.map((h) => h.right)), top: Math.min(...heads.map((h) => h.top)), bottom: Math.max(...heads.map((h) => h.bottom)) } : g;
    }
    return null;
  };
  // 채점 결과: 높았는지 낮았는지 음표 옆에 ▲/▼ (초록 밖인 음, 다른 음은 낸 음 이름)
  const [devPos, setDevPos] = useState<{ key: string; x: number; y: number; up: boolean; label: string; color: string }[]>([]);
  useEffect(() => {
    const wrap = sheetWrap.current;
    if (!wrap || !result || view !== 'pitch') { setDevPos([]); return; }
    const base = wrap.getBoundingClientRect();
    const out: typeof devPos = [];
    for (const r of result) {
      const key = `${r.note.measure}:${r.note.index}`;
      let up: boolean, label: string;
      if (r.status === 'ok' && r.cents !== null && Math.abs(r.cents) > tol.good) { up = r.cents > 0; label = `${Math.round(Math.abs(r.cents))}`; }
      else if (r.status === 'wrong' && r.playedMidi !== null && r.playedMidi !== r.note.midi) { up = r.playedMidi > r.note.midi; label = midiName(r.playedMidi); }
      else continue;
      const rc = noteRect(key);
      if (!rc) continue;
      out.push({ key, x: rc.right - base.left + 1, y: (rc.top + rc.bottom) / 2 - base.top, up, label, color: colorFor(r) });
    }
    setDevPos(out);
  }, [result, view, renderTick, tol.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ♯·♭ 형광펜: 음표 묶음(머리·기둥·임시표) 뒤에 노란 띠
  const [accPos, setAccPos] = useState<{ key: string; x: number; y: number; w: number; h: number }[]>([]);
  useEffect(() => {
    const wrap = sheetWrap.current;
    if (!wrap || !hlOn) { setAccPos([]); return; }
    const base = wrap.getBoundingClientRect();
    const skip = new Set(accSkip);
    const out: typeof accPos = [];
    for (const n of expected) {
      if (!n.acc || skip.has(n.acc)) continue;
      const key = `${n.measure}:${n.index}`;
      const head = noteRect(key);
      if (!head) continue;
      const id = (els.current.get(key) ?? [])[0];
      const g = id ? (document.getElementById(id) ?? document.getElementById(`vf-${id}`))?.getBoundingClientRect() : undefined;
      const top = Math.min(head.top, g?.top ?? head.top), bottom = Math.max(head.bottom, g?.bottom ?? head.bottom);
      const w = Math.max(10, head.right - head.left + 6);
      out.push({ key, x: head.left - base.left - 3, y: top - base.top - 3, w, h: bottom - top + 6 });
    }
    setAccPos(out);
  }, [hlOn, accSkip, expected, renderTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // 레슨 노트가 붙은 마디: 첫 음 왼쪽 위에 📝
  const [lessonPos, setLessonPos] = useState<{ m: number; x: number; top: number; n: number }[]>([]);
  useEffect(() => {
    const wrap = sheetWrap.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    const cnt = new Map<number, number>();
    for (const n of lessonNotes) if (!n.done && n.measure !== undefined && n.measure >= from && n.measure <= to) cnt.set(n.measure, (cnt.get(n.measure) ?? 0) + 1);
    const out: typeof lessonPos = [];
    for (const [m, n] of cnt) {
      const key = [...els.current.keys()].find((k) => k.startsWith(`${m}:`));
      const r = key ? noteRect(key) : null;
      if (!r) continue;
      out.push({ m, x: r.left - base.left - 6, top: r.top - base.top - 34, n });
    }
    setLessonPos(out);
  }, [renderTick, lessonNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  // 음표를 누르면 그 마디부터 듣기·채점
  const [hereKey, setHereKey] = useState<string | null>(null);
  const [pendingFrom, setPendingFrom] = useState<{ m: number; act: 'play' | 'score' } | null>(null);
  function pickNote(clientX: number, clientY: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const key of els.current.keys()) {
      const r = noteRect(key);
      if (!r) continue;
      const dx = Math.max(r.left - clientX, 0, clientX - r.right), dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const d = Math.hypot(dx, dy * 0.6);
      if (d < bd) { bd = d; best = key; }
    }
    return best && bd <= 28 ? best : null;
  }
  function onSheetTap(clientX: number, clientY: number) {
    if (listening || playing) return;
    const k = pickNote(clientX, clientY);
    if (tool === 'edit') { if (k) { setEditMsg(''); setEditKey(k); } return; }
    setHereKey(k);
  }
  /** 음 고치기 적용 (처음 고칠 때 원래 악보를 따로 둠) */
  async function applyEdit(key: string, op: EditOp) {
    const [m, i] = key.split(':').map(Number);
    const r = editNote(score.xml, m, i, op, myPart);
    if ('error' in r) { setEditMsg(r.error); return; }
    setEditMsg('');
    setResult(null); setPastRun(null);
    if (op.kind === 'rest') setEditKey(null);
    await db.scores.update(score.id!, { xml: r.xml, origXml: score.origXml ?? score.xml });
  }
  async function revertBar(key: string) {
    if (!score.origXml) return;
    const m = Number(key.split(':')[0]);
    const r = revertMeasure(score.xml, score.origXml, m, myPart);
    if ('error' in r) { setEditMsg(r.error); return; }
    setResult(null); setPastRun(null);
    await db.scores.update(score.id!, { xml: r.xml });
  }
  async function revertAll() {
    if (!score.origXml || !confirm('고친 음을 모두 버리고 처음 악보로 되돌릴까요?')) return;
    setResult(null); setPastRun(null); setEditKey(null);
    await db.scores.update(score.id!, { xml: score.origXml, origXml: undefined });
  }
  useBackLayer(editKey !== null, () => setEditKey(null));
  function startFrom(key: string, act: 'play' | 'score') {
    const m = Number(key.split(':')[0]);
    setHereKey(null);
    setRange(m, m + (lenLock ?? span) - 1);
    setPendingFrom({ m, act });
  }
  useBackLayer(hereKey !== null, () => setHereKey(null));
  useEffect(() => {
    if (!pendingFrom || from !== pendingFrom.m) return;
    const act = pendingFrom.act;
    setPendingFrom(null);
    if (act === 'play') { curIdx.current = 0; playRangeRef.current(); } else void startRef.current();
  }, [pendingFrom, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setTimeout(() => { db.scores.update(score.id!, { lastFrom: from, lastTo: to }).catch(() => {}); }, 1500);
    return () => clearTimeout(id);
  }, [score.id, from, to]);

  // 연주 듣기: 음 단위로 모으기
  const segRef = useRef<NoteSegmenter | null>(null);
  /** 채점을 시작할 때의 구간 (듣는 중에 구간을 바꿔도 채점은 이 구간으로) */
  const listenCtx = useRef<{ expected: typeof expected; from: number; to: number; inSession: boolean; ladder?: number } | null>(null);

  useEffect(() => {
    if (!listening) return;
    const seg = new NoteSegmenter(equalRef(settings.a4));
    segRef.current = seg;
    dbTrack.current = [];
    const unsub = pitchTracker.subscribe((r) => {
      if (r.freq !== null && Number.isFinite(r.db)) dbTrack.current.push([r.time, r.db]);
      const n = seg.push(r.time, r.freq);
      if (n) { played.current.push({ midi: n.midi, cents: n.settledCents ?? n.meanCents, start: n.start, db: meanDb(dbTrack.current, n.start + 0.05, n.end) }); tick((x) => x + 1); }
    });
    return unsub;
  }, [listening, settings.a4]);

  // 진행 표시: 짧은 구간은 정확히 맞춰 보고, 긴 구간은 연주한 음 수로 대신 (매 음마다 전체 맞추기는 무거움)
  const live = useMemo(() => {
    if (!listening) return 0;
    const exp = listenCtx.current?.expected ?? expected;
    if (exp.length <= 160) return alignNotes(exp, played.current).filter((r) => r.status !== 'missed').length;
    let n = 0, last = -1;
    for (const p of played.current) { if (p.midi !== last) n++; last = p.midi; }
    return Math.min(exp.length, n);
  }, [listening, expected, played.current.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveDone = live;

  function highlight(key: string | null, scroll = true) {
    litKey.current = key;
    lit.current.forEach((g) => g.classList.remove('now-note'));
    const ids = key ? els.current.get(key) ?? [] : [];
    lit.current = ids.map((id) => document.getElementById(id) ?? document.getElementById(`vf-${id}`)).filter((x): x is HTMLElement & SVGGElement => !!x) as unknown as SVGGElement[];
    lit.current.forEach((g) => g.classList.add('now-note'));
    if (scroll) lit.current[0]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  const curIdx = useRef(0);
  async function playRange(resumeAt?: number, o: { keepListening?: boolean; muteMine?: boolean; autoStop?: boolean; click?: boolean | 'visual'; acc?: boolean } = {}) {
    if (listening && !o.keepListening) stop();
    const full = planPlayback(parsed, { bpm: playBpm, from, to, countIn: o.keepListening ? true : resumeAt === undefined && countIn, expressive: expressive && !o.keepListening, order }, hasAcc && (o.keepListening ? o.acc : accOn) ? accParts : []);
    const plan = resumeAt === undefined ? full : slicePlan(full, resumeAt);
    const base = resumeAt ?? 0;
    setPausedAt(null);
    setPlaying(true);
    await scorePlayer.play(plan, {
      a4: settings.a4,
      click: o.click ?? withClick,
      onBeat,
      voice,
      mute: o.muteMine ?? (hasAcc && mute),
      onNote: (e, idx) => {
        if (e) curIdx.current = base + (idx ?? plan.events.indexOf(e));
        highlight(e ? `${e.note.measure}:${e.note.index}` : null);
        setNowMeasure(e ? e.note.measure : null);
      },
      onEnd: () => {
        if (o.keepListening) {
          highlight(null); setPlaying(false);
          if (o.autoStop !== false) endTimer.current = setTimeout(() => { endTimer.current = null; stopRef.current(); }, 800);
          return;
        }
        if (loopRef.current) playRangeRef.current(); else { highlight(null); setPlaying(false); }
      },
    });
    setVoiceNote(voice === 'sample' && !scorePlayer.usedSample ? `${P.sampleName} 소리를 불러오지 못해서 합성음으로 재생해요. (첫 재생은 인터넷 연결이 필요해요)` : '');
  }
  const playRangeRef = useRef(playRange);
  playRangeRef.current = playRange;
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 듣는 중에 템포를 바꾸면 지금 음부터 새 템포로 이어서
  const playingRef = useRef(false);
  playingRef.current = playing;
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  const firstBpm = useRef(true);
  useEffect(() => {
    if (firstBpm.current) { firstBpm.current = false; return; }
    if (!playingRef.current || listeningRef.current) return;
    const id = setTimeout(() => { if (playingRef.current) playRange(curIdx.current); }, 200);
    return () => clearTimeout(id);
  }, [playBpm]); // eslint-disable-line react-hooks/exhaustive-deps
  function stopPlay() { scorePlayer.stop(); highlight(null); setNowMeasure(null); setPlaying(false); setPausedAt(null); }
  function pausePlay() { scorePlayer.stop(); setPlaying(false); setPausedAt(curIdx.current); }
  function resumePlay() { const i = pausedAt ?? 0; setPausedAt(null); playRange(i); }
  function restartPlay() { setPausedAt(null); curIdx.current = 0; playRange(); }

  async function start() {
    if (listeningRef.current) return;
    if (playing || pausedAt !== null) stopPlay();
    setResult(null);
    setSaved(null);
    setPassMsg(null);
    setPastRun(null);
    setEditKey(null);
    setLadderMsg(null);
    setReviewMsg(null);
    played.current = [];
    if (!pitchTracker.running) await pitch.start();
    if (!pitchTracker.running) return; // 마이크를 못 열면 시작하지 않음 (오류 문구는 pitch.error)
    runStart.current = Date.now();
    listenCtx.current = { expected, from, to, inSession: !!session && session.runningSince !== null, ladder: ladderOn ? playBpm : undefined };
    if (recOn) { try { await recorder.start(settings.a4); } catch { /* 녹음 못 해도 채점은 계속 */ } }
    listeningRef.current = true;
    setListening(true);
    // 반주·박자(깜빡임·소리)·템포 사다리: 내 파트 소리는 끄고 한 마디 세고 시작.
    // 반주는 끝나면 채점도 끝, 박자만이면 끝나도 채점은 계속 (느리게 쳐도 잘리지 않게)
    const withAcc = hasAcc && scoreWithAcc;
    const metro = scoreMetro;
    if (withAcc || metro !== 'off' || ladderOn) {
      curIdx.current = 0;
      playRange(undefined, { keepListening: true, muteMine: true, acc: withAcc, autoStop: withAcc, click: metro === 'sound' ? true : metro === 'visual' ? 'visual' : false });
    }
  }
  function stop() {
    if (!listeningRef.current) return; // 두 번 끝나지 않게
    listeningRef.current = false;
    if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; }
    if (playingRef.current) stopPlay();
    // 마지막 음까지 모으고 바로 채점
    const last_ = segRef.current?.flush();
    if (last_) played.current.push({ midi: last_.midi, cents: last_.settledCents ?? last_.meanCents, start: last_.start, db: meanDb(dbTrack.current, last_.start + 0.05, last_.end) });
    segRef.current = null;
    setListening(false);
    const ctx = listenCtx.current ?? { expected, from, to, inSession: !!session };
    listenCtx.current = null;
    const recP = recorder.stop();
    const durationSec = (Date.now() - runStart.current) / 1000;
    const r = alignNotes(ctx.expected, played.current);
    setResult(r);
    const sm = summarizeScore(r);
    // 연습곡 진도는 먼저 (저장 공간 문제로 녹음 저장이 실패해도 남도록)
    if (ex && ctx.from <= firstNoteMeasure && ctx.to >= last && r.length) {
      const pct = Math.round((sm.ok / Math.max(1, sm.total)) * 100);
      recordProgress(ex.progressId ?? ex.stepId, pct, sm.meanAbs, playBpm).then((ok) => setPassMsg(ok ? '통과! 다음 단계로 가거나 템포를 올려 보세요.' : null)).catch(() => {});
    }
    // 템포 사다리 판정
    const rhNow = r.length ? analyzeRhythm(parsed, r) : null;
    if (ctx.ladder !== undefined && r.some((x) => x.status !== 'missed')) {
      const pct = Math.round((sm.ok / Math.max(1, sm.total)) * 100);
      const v = ladderVerdict({ pct, target: ctx.ladder, bpm: rhNow ? rhNow.bpm : null, rhythmMeanAbs: rhNow ? rhNow.meanAbs : null, meanAbs: sm.meanAbs, tol });
      setLadderMsg({ pass: v.pass, text: v.msg });
      const best = Math.max(score.ladder?.best ?? 0, v.pass ? ctx.ladder : 0);
      db.scores.update(score.id!, { ladder: { bpm: v.next, best, at: Date.now() } }).catch(() => {});
      setPlayBpm(v.next);
      if (v.pass && score.pieceId) db.pieces.get(score.pieceId).then((pc) => { if (pc && (pc.currentBpm ?? 0) < ctx.ladder!) db.pieces.update(pc.id, { currentBpm: ctx.ladder }); }).catch(() => {});
    }
    // 복습함 (내 악보만, 연습곡은 다시 만들어지니 빼요)
    if (!ex && r.length) {
      const stats = measureStats(r);
      const today = localDate();
      void db.reviews.where('scoreId').equals(score.id!).toArray().then(async (rows) => {
        const c = reviewChanges(new Map(rows.map((x) => [x.id, x])), stats, score.id!, score.title, today, tol);
        if (c.put.length) await db.reviews.bulkPut(c.put);
        if (c.del.length) await db.reviews.bulkDelete(c.del);
        setReviewMsg(reviewMessage(c));
      }).catch(() => {});
    }
    void (async () => {
      const rec = await recP;
      const played_ = r.filter((x) => x.status !== 'missed').length;
      if (played_ < 2 || durationSec < 2) return;
      const rh = rhNow;
      const weak = [...sm.byMeasure.entries()].filter(([, v]) => v !== null).sort((a, b) => b[1]! - a[1]!).slice(0, 3).map(([m]) => m);
      const run: ScoreRun = {
        createdAt: Date.now(), date: localDate(), scoreId: score.id!, title: score.title, pieceId: score.pieceId, exerciseId: ex?.stepId,
        from: ctx.from, to: ctx.to, durationSec, total: sm.total, ok: sm.ok, wrong: sm.wrong, missed: sm.missed, meanAbs: sm.meanAbs,
        rhythmMs: rh?.meanAbsMs ?? null, bpm: rh ? Math.round(rh.bpm) : null, inSession: ctx.inSession, weakMeasures: weak,
        noteCents: noteCentsOf(r), ladderBpm: ctx.ladder, gearId: await currentGearId(), notes: toRunNotes(r),
      };
      let runId: number;
      try { runId = await db.scoreRuns.add(run); } catch { setSaved('연습 기록을 저장하지 못했어요. 저장 공간을 확인해 주세요.'); return; }
      let recMsg = '';
      if (rec && rec.durationSec >= 1) {
        try {
          const recId = await db.recordings.add({
            createdAt: run.createdAt, date: run.date, pieceId: score.pieceId, title: `${score.title} · ${ctx.from}~${ctx.to}마디`,
            durationSec: rec.durationSec, mime: rec.mime, blob: rec.blob, track: rec.track, scoreId: score.id!, runId,
          } as Recording);
          await db.scoreRuns.update(runId, { recordingId: recId });
          recMsg = '과 녹음';
        } catch { recMsg = '(녹음은 저장 공간이 부족해 저장하지 못했어요)'; }
      }
      if (score.pieceId) await db.pieces.update(score.pieceId, { lastPracticed: run.date }).catch(() => {});
      setSaved(recMsg.startsWith('(') ? `연습 기록을 저장했어요 ${recMsg}` : `연습 기록${recMsg}을 저장했어요.`);
    })();
    pitch.stop(); // 채점이 끝나면 마이크를 닫음
  }
  // 화면을 떠날 때: 듣는 중이면 지금까지를 채점·저장 (layout 정리는 마이크가 닫히기 전에 돌아감)
  useLayoutEffect(() => () => {
    if (listeningRef.current) stopRef.current();
    else if (recorder.recording) void recorder.stop();
    if (endTimer.current) clearTimeout(endTimer.current);
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const startRef = useRef(start);
  startRef.current = start;
  const setRange = (a: number, b: number) => {
    if (listeningRef.current) return; // 채점 중에는 구간 고정
    if (playingRef.current || pausedAt !== null) stopPlay();
    const A = Math.max(first, Math.min(last, a)), B = Math.max(A, Math.min(last, b));
    setFrom(A); setTo(B); setResult(null); setPastRun(null);
  };
  /** 지난 기록의 분석을 악보에 다시 보이기 (음마다 저장된 기록만) */
  function showRun(r: ScoreRun) {
    if (!r.notes?.length || listeningRef.current) return;
    setRange(r.from, r.to);
    setResult(fromRunNotes(r.notes, parsed));
    setPastRun(r);
    setView('pitch');
    setTimeout(() => resultCard.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 200);
  }
  const runShown = useRef(false);
  useEffect(() => {
    if (runShown.current || initial?.runId === undefined || !runs.length) return;
    const r = runs.find((x) => x.id === initial.runId);
    runShown.current = true;
    if (r) showRun(r);
  }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || initial?.measure === undefined) return;
    initDone.current = true;
    setRange(initial.measure, initial.measure + span - 1);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const hasDyn = useMemo(() => parsed.notes.some((n) => n.art?.dyn !== undefined || n.art?.wedge !== undefined), [parsed]);
  const resultHasDb = !!result?.some((r) => r.db != null);
  const span = to - from + 1;
  const shiftSet = useMemo(() => new Set(ex?.breakKeys ?? []), [ex]);
  const shiftRes = result && ex ? result.filter((r) => shiftSet.has(`${r.note.measure}:${r.note.index}`)) : [];
  const shiftOk = shiftRes.filter((r) => r.status === 'ok');
  const shiftMean = shiftOk.length ? shiftOk.reduce((a, r) => a + Math.abs(r.cents!), 0) / shiftOk.length : null;
  async function regenerate() {
    if (!ex) return;
    setRegenBusy(true);
    try { await createExercise(ex.stepId, ex.spec, loadOpts(), ex.seed + 1, ex.tempo, ex.tip); }
    finally { setRegenBusy(false); }
  }
  const bowIdx = ex?.spec.pattern === 'art' ? ART_VARIANTS.findIndex((v) => v.id === ex.spec.variant) : -1;
  async function goVariant(step: number) {
    if (!ex || bowIdx < 0) return;
    const v = ART_VARIANTS[(bowIdx + step + ART_VARIANTS.length) % ART_VARIANTS.length];
    setRegenBusy(true);
    try { await createArt(ex.spec.base ?? 'five', ex.spec.key, v.id, loadOpts(), playBpm); } finally { setRegenBusy(false); }
  }
  async function rebuild() {
    if (!ex) return;
    if (bowIdx >= 0) return goVariant(0);
    setRegenBusy(true);
    try { await createExercise(ex.stepId, ex.spec, loadOpts(), ex.seed, ex.tempo, ex.tip); } finally { setRegenBusy(false); }
  }
  const sum = result ? summarizeScore(result) : null;
  const worst = result ? result.filter((r) => r.status === 'ok').sort((a, b) => Math.abs(b.cents!) - Math.abs(a.cents!)).slice(0, 6) : [];

  return (
    <section className={`page score score-view ${focus ? 'focus' : ''}`} data-testid="score-view">
      <div className="score-top">
      <div className="card-head">
        <button className="mini" onClick={() => { if (listening) stop(); pitch.stop(); onClose(); }}>◀ 목록</button>
        <b className="score-title">{score.title}</b>
      </div>
      {!ex && <LessonChecklist scoreId={score.id!} onMeasure={(m) => setRange(m, m + (lenLock ?? span) - 1)} />}

      {ex && (
        <div className="card" data-testid="exercise-card">
          {bowIdx >= 0 && (
            <div className="session-controls">
              <button onClick={() => goVariant(-1)} disabled={regenBusy || playing || listening}>◀ 이전 변형</button>
              <span className="muted small">{bowIdx + 1} / {ART_VARIANTS.length}</span>
              <button onClick={() => goVariant(1)} disabled={regenBusy || playing || listening} data-testid="bow-next">다음 변형 ▶</button>
            </div>
          )}
          {(step?.tip ?? ex.tip) && <p className="hint"><b>팁</b> {step?.tip ?? ex.tip}</p>}
          {(ex.breakKeys?.length ?? 0) > 0 && <p className="hint">{P.breakNotes} {ex.breakKeys.length}개는 채점 뒤에 따로 보여줘요.</p>}
          <div className="session-controls">
            <button onClick={rebuild} disabled={regenBusy || playing || listening} title="연습곡 화면에서 바꾼 리듬·아티큘레이션 설정으로 다시 만들기">설정 다시 적용</button>
            {ex.spec.pattern === 'etude' && <button onClick={regenerate} disabled={regenBusy || playing || listening} data-testid="ex-regen">다른 곡 만들기</button>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="range-row">
          <span className="rg"><span className="range-label">시작</span>
          <NumField value={from} min={first} max={last} label="시작 마디" disabled={listening} testId="from" width={52} onChange={(v) => setRange(v, lenLock ? v + lenLock - 1 : Math.max(v, to))} /></span>
          <span className="rg"><span className="range-label">끝</span>
          <NumField value={to} min={from} max={last} label="끝 마디" disabled={listening} testId="to" width={52} onChange={(v) => { setLenLock(null); setRange(from, v); }} /></span>
          <span className="muted small">{span}마디 · {expected.length}음</span>
        </div>
        <div className="chips len-chips" data-testid="len-chips">
          {[1, 2, 4, 8, 16].map((n) => (
            <button key={n} className={`chip ${lenLock === n ? 'on' : ''}`} disabled={listening} onClick={() => { setLenLock(n); setRange(from, from + n - 1); }}>{n}마디</button>
          ))}
        </div>
        <div className="session-controls">
          <button onClick={() => setRange(from - span, to - span)} disabled={listening || from <= first}>◀ 앞 구간</button>
          <button disabled={listening} onClick={() => { setLenLock(null); setRange(firstNoteMeasure, last); }}>전체</button>
          <button onClick={() => setRange(from + span, to + span)} disabled={listening || to >= last}>다음 구간 ▶</button>
        </div>
        {dueHere.length > 0 && (
          <div className="review-here" data-testid="review-here">
            <span className="small"><b>오늘 복습할 마디</b></span>
            <div className="chips">
              {dueHere.map((r) => (
                <button key={r.id} className={`chip ${from === r.measure && to === r.measure ? 'on' : ''}`} disabled={listening} onClick={() => { setLenLock(null); setRange(r.measure, r.measure); }}>{r.measure}마디</button>
              ))}
              {dueHere.length > 1 && <button className="chip" disabled={listening} onClick={() => { setLenLock(null); setRange(dueHere[0].measure, dueHere[dueHere.length - 1].measure); }}>{dueHere[0].measure}~{dueHere[dueHere.length - 1].measure} 한 번에</button>}
            </div>
          </div>
        )}
      </div>

      <div className="card" data-testid="play-card">
        <div className="card-head"><b>악보 듣기</b>{playing && nowMeasure !== null && <span className="muted small">{nowMeasure}마디</span>}</div>
        <div className="row-setting">
          <span>♩ =</span>
          <NumField value={playBpm} min={30} max={200} step={5} label="재생 템포" testId="play-bpm" onChange={setPlayBpm} />
        </div>
        <div className="row-setting">
          <label><input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> 시작 전 한 마디 세기</label>
          <label><input type="checkbox" checked={withClick} onChange={(e) => setWithClick(e.target.checked)} /> 메트로놈</label>
          <label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> 반복</label>
          {repeats && <label title="도돌이표·1·2번 괄호대로 펼쳐서 (구간 안에서)"><input type="checkbox" checked={unfold} onChange={(e) => setUnfold(e.target.checked)} disabled={playing} data-testid="unfold" /> 도돌이표대로</label>}
          <label title="셈여림(p·f·쐐기), 스타카토·테누토·강세, 이음줄(혀로 끊지 않고 이어서), 늘임표, rit.·a tempo 를 악보대로"><input type="checkbox" checked={expressive} onChange={(e) => setExpressive(e.target.checked)} disabled={playing} data-testid="expressive" /> 셈여림·아티큘레이션 살리기</label>
        </div>
        <div className="segmented small">
          <button className={voice === 'sample' ? 'on' : ''} onClick={() => setVoice('sample')} disabled={playing}>{P.sampleName} 녹음</button>
          <button className={voice === 'synth' ? 'on' : ''} onClick={() => setVoice('synth')} disabled={playing}>합성음</button>
        </div>
        {hasAcc && (
          <div className="row-setting">
            <label><input type="checkbox" checked={accOn} onChange={(e) => setAccOn(e.target.checked)} data-testid="acc-on" /> 반주 같이</label>
            <label><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} data-testid="acc-mute" /> 내 파트 소리 끄기</label>
          </div>
        )}
        {voiceNote && <p className="hint">{voiceNote}</p>}
        <button className={`secondary wide ${playing ? 'on' : ''}`} onClick={playing || pausedAt !== null ? stopPlay : () => { curIdx.current = 0; playRange(); }} disabled={!expected.length} data-testid="play-toggle">
          {playing || pausedAt !== null ? '■ 듣기 멈추기' : `▶ ${from}~${to}마디 들어보기`}
        </button>
        <p className="hint">템포는 4분음표 기준이에요. 처음엔 느리게 들으며 음정과 리듬을 익히고, 반복을 켜 두고 같이 연주해 보세요.</p>
      </div>

      <div className="card">
        <div className={`ladder-row ${ladderOn ? 'on' : ''}`} data-testid="ladder-row">
          <label><input type="checkbox" checked={ladderOn} disabled={listening} onChange={(e) => setLadderOn(e.target.checked)} data-testid="ladder-on" /> <b>템포 사다리</b></label>
          {ladderOn && (
            <span className="ladder-bpm">
              <button className="mini" disabled={listening} onClick={() => setPlayBpm((b) => Math.max(30, b - LADDER_STEP))} aria-label="사다리 템포 내리기">−</button>
              <b>♩={playBpm}</b>
              <button className="mini" disabled={listening} onClick={() => setPlayBpm((b) => Math.min(200, b + LADDER_STEP))} aria-label="사다리 템포 올리기">+</button>
              {score.ladder?.best ? <span className="muted small">최고 ♩={score.ladder.best}</span> : null}
            </span>
          )}
        </div>
        {!listening && <GearPicker />}
        {ladderOn && <p className="hint">한 마디 세어 주는 템포에 맞춰 연주하세요. 맞은 음 90% 이상 + 음정 평균 ±{tol.warn}센트 안 + 템포를 지키면 통과, ♩+{LADDER_STEP}로 올라가요. 70% 아래면 한 칸 내려가요.</p>}
        {!listening ? (
          <button className="primary wide big" onClick={start} disabled={!expected.length} data-testid="score-start">● 이 구간 연주하고 채점받기</button>
        ) : (
          <>
            <div className="rec-live"><span className="rec-dot" /> {recorder.recording ? '녹음 · ' : ''}듣는 중 · {liveDone}/{expected.length}음</div>
            {livePitch && <div className="live-pitch-row"><span className="muted small">지금 내는 음</span> <LivePitch a4={settings.a4} tol={tol} /></div>}
            <div className="progress"><div style={{ width: `${(liveDone / Math.max(1, expected.length)) * 100}%` }} /></div>
            <button className="primary wide big stop" onClick={stop} data-testid="score-stop">■ 끝내고 채점</button>
          </>
        )}
        {!listening && (
          <label className="small"><input type="checkbox" checked={recOn} onChange={(e) => setRecOn(e.target.checked)} data-testid="score-rec" /> 연주를 녹음해서 연습 기록 · 녹음에 함께 저장</label>
        )}
        {hasAcc && !listening && (
          <label className="small"><input type="checkbox" checked={scoreWithAcc} onChange={(e) => setScoreWithAcc(e.target.checked)} data-testid="score-with-acc" /> 반주를 틀고 같이 연주하며 채점 (이어폰을 쓰면 반주 소리가 섞이지 않아요)</label>
        )}
        {!listening && (
          <div className="metro-pick" role="group" aria-label="채점할 때 박자">
            <span className="small">박자</span>
            {([['off', '끔'], ['visual', '깜빡임'], ['sound', '메트로놈 소리']] as const).map(([v, l]) => (
              <button key={v} type="button" className={`chip ${scoreMetro === v ? 'on' : ''}`} onClick={() => setScoreMetro(v)} data-testid={`score-metro-${v}`}>{l}</button>
            ))}
          </div>
        )}
        {!listening && (
          <div className="metro-pick" role="group" aria-label="음정 판정 기준">
            <span className="small">판정</span>
            {(['strict', 'normal', 'relaxed'] as ToleranceId[]).map((id) => (
              <button key={id} type="button" className={`chip ${tol.id === id ? 'on' : ''}`} title={TOLERANCES[id].hint} onClick={() => updateSettings({ pitchTolerance: id })} data-testid={`tol-${id}`}>{TOLERANCES[id].label} ±{TOLERANCES[id].good}/{TOLERANCES[id].warn}</button>
            ))}
          </div>
        )}
        {!listening && (
          <label className="small"><input type="checkbox" checked={livePitch} onChange={(e) => setLivePitch(e.target.checked)} data-testid="score-live-pitch" /> 연주하는 동안 지금 내는 음 보기 (튜너보다 천천히 움직여요)</label>
        )}
        {!listening && (scoreMetro !== 'off' || ladderOn) && (
          <p className="hint small">재생 템포 ♩{playBpm}로 한 마디 세고 시작해요. 악보에 지금 불 음도 따라 표시돼요.{scoreMetro === 'sound' ? ' 이어폰(유선 권장)으로 들으면 녹음에 클릭이 안 들어가요. 스피커로 들어도 채점은 클릭 소리를 빼고 해요.' : scoreMetro === 'visual' ? ' 소리 없이 아래 점이 박마다 깜빡여요.' : ' (세기만 하고 그 뒤로는 조용해요. 박자를 계속 들으려면 위에서 "메트로놈 소리"나 "깜빡임"을 고르세요.)'}</p>
        )}
        {pitch.error && <p className="error">{pitch.error}</p>}
        <p className="hint">{ladderOn || scoreMetro !== 'off' ? '' : '템포는 상관없어요. '}악보 순서대로 연주하면 음을 맞춰 보고, 음표 색으로 보여줘요. 초록 ±{tol.good}센트 안, 노랑 ±{tol.warn}, 빨강 그 이상 (판정 기준 '{tol.label}'. 복습함·템포 사다리도 이 기준을 따라요), 보라 다른 음, 회색 놓친 음. 음표 옆 ▲는 높게, ▼는 낮게 낸 것(숫자는 센트, 보라는 실제로 낸 음). 박자도 함께 봐요: 내 템포에 맞춰 각 음이 일찍·늦게 들어갔는지.</p>
      </div>

      </div>
      <div className="score-main">
      <div className="sheet-bar">
        <span className="muted small">{from}~{to}마디{nowMeasure !== null ? ` · 지금 ${nowMeasure}마디` : ''}</span>
        <span className="zoom">
          <button className={`mini ${tool === 'edit' ? 'on' : ''}`} onClick={() => { setTool(tool === 'edit' ? 'none' : 'edit'); setEditKey(null); setHereKey(null); }} disabled={listening} data-testid="edit-toggle" title="틀린 음을 눌러 높이·길이 고치기">♪ 음 고치기</button>
          <button className={`mini ${hlOn ? 'on' : ''}`} onClick={() => setHlOn(!hlOn)} data-testid="acc-toggle" title="조표·임시표로 바뀐 음(♯·♭)에 형광펜">♯♭ 표시</button>
          <button className={`mini ${focus ? 'on' : ''}`} onClick={() => setFocus(!focus)} data-testid="focus-toggle">{focus ? '메뉴 보기' : '악보만'}</button>
          <button className="mini" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label="악보 작게">가−</button>
          <button className="mini" onClick={() => setZoom(1)} aria-label="악보 기본 크기">{Math.round(zoom * 100)}%</button>
          <button className="mini" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} aria-label="악보 크게">가+</button>
        </span>
      </div>
      {hlOn && (
        <div className="acc-bar" data-testid="acc-bar">
          {accNames.length === 0 ? <span className="muted small">이 구간에는 ♯·♭이 붙는 음이 없어요.</span> : (
            <>
              <span className="muted small">형광펜</span>
              {accNames.map((a) => {
                const off = accSkip.includes(a);
                return <button key={a} className={`chip acc-chip ${off ? '' : 'on'}`} onClick={() => setAccSkip(off ? accSkip.filter((x) => x !== a) : [...accSkip, a])} aria-pressed={!off} data-testid="acc-chip">{a}</button>;
              })}
              <span className="muted small">익숙한 음은 눌러서 빼요</span>
            </>
          )}
        </div>
      )}
      <div className="score-sheet">
        {rendering && <p className="muted small">악보를 그리는 중…</p>}
        {renderError && <p className="error">{renderError}</p>}
        {tool === 'edit' && (
          <p className="small tap-hint edit-hint" data-testid="edit-hint">고칠 음표를 누르세요. 처음 악보는 따로 보관돼요.
            {score.origXml && <button className="link small" onClick={revertAll} data-testid="edit-revert-all"> 원래 악보로 되돌리기</button>}</p>
        )}
        {tool === 'none' && !listening && !playing && <p className="muted small tap-hint">음표를 누르면 그 마디부터 듣거나 채점할 수 있어요.</p>}
        <div ref={sheetWrap} className={`sheet-wrap ${tool !== 'none' ? 'marking' : ''}`} onClick={(e) => onSheetTap(e.clientX, e.clientY)} data-testid="sheet-wrap">
          <div ref={holder} data-testid="osmd" />
          <div className="mark-layer" aria-hidden>
            {accPos.map(({ key, x, y, w, h }) => <span key={`a${key}`} className="acc-hl" style={{ left: x, top: y, width: w, height: h }} data-testid="acc-hl" />)}
            {devPos.map(({ key, x, y, up, label, color }) => (
              <span key={`d${key}`} className={`dev-tag ${up ? 'up' : 'down'}`} style={{ left: x, top: y, color }} data-testid="dev-tag">{up ? '▲' : '▼'}{label}</span>
            ))}
            {lessonPos.map(({ m, x, top, n }) => (
              <span key={`l${m}`} className="lesson-pin" style={{ left: x, top }} title={`레슨 노트 ${n}개`} data-testid="lesson-pin">📝{n > 1 ? n : ''}</span>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className="score-bottom">
      {sum && (
        <div className="card" data-testid="score-result" ref={resultCard}>
          {pastRun && (
            <div className="past-run" data-testid="past-run">
              <span>{new Date(pastRun.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 연습 기록을 보고 있어요 ({pastRun.from}~{pastRun.to}마디{pastRun.bpm ? ` · ♩≈${pastRun.bpm}` : ''})</span>
              <button className="mini" onClick={() => { setResult(null); setPastRun(null); }}>닫기</button>
            </div>
          )}
          <div className="stats">
            <div><b>{Math.round((sum.ok / Math.max(1, sum.total)) * 100)}%</b><span>맞은 음 {sum.ok}/{sum.total}</span></div>
            <div><b>{sum.meanAbs === null ? '—' : `±${Math.round(sum.meanAbs)}`}</b><span>평균 오차(센트)</span></div>
            <div><b>{sum.wrong + sum.missed}</b><span>다른 음·놓침</span></div>
          </div>
          <p className="hint small dev-legend" data-testid="dev-legend"><span style={{ color: COLOR.good }}>●</span> ±{tol.good}센트 안 · <span style={{ color: COLOR.warn }}>●</span> ±{tol.warn} · <span style={{ color: COLOR.bad }}>●</span> 그 이상 · <span style={{ color: COLOR.wrong }}>●</span> 다른 음 · <span style={{ color: COLOR.missed }}>●</span> 놓침 — 음표 옆 <b>▲</b> 높게 <b>▼</b> 낮게 (숫자 = 센트)</p>
          {rhythm && (
            <div className="stats" data-testid="rhythm-stats">
              <div><b>♩≈{Math.round(rhythm.bpm)}</b><span>내 템포</span></div>
              <div><b className={rhythmTone(rhythm.meanAbs)}>±{Math.round(rhythm.meanAbsMs)}ms</b><span>박자 오차 (박의 {Math.round(rhythm.meanAbs * 100)}%)</span></div>
              <div><b>{rhythm.drift === null ? '—' : Math.abs(rhythm.drift) < 0.04 ? '고름' : rhythm.drift > 0 ? `${Math.round(rhythm.drift * 100)}% 빨라짐` : `${Math.round(-rhythm.drift * 100)}% 느려짐`}</b><span>뒤로 갈수록</span></div>
            </div>
          )}
          {(rhythm || (hasDyn && resultHasDb)) && (
            <div className="segmented small">
              <button className={view === 'pitch' ? 'on' : ''} onClick={() => setView('pitch')} data-testid="view-pitch">음정으로 보기</button>
              {rhythm && <button className={view === 'rhythm' ? 'on' : ''} onClick={() => setView('rhythm')} data-testid="view-rhythm">박자로 보기</button>}
              {hasDyn && resultHasDb && <button className={view === 'dyn' ? 'on' : ''} onClick={() => setView('dyn')} data-testid="view-dyn">셈여림으로 보기</button>}
            </div>
          )}
          {view === 'dyn' && hasDyn && <DynChart result={result!} parsed={parsed} />}
          {passMsg && <p className="good"><b>✓ {passMsg}</b></p>}
          {ladderMsg && <p className={ladderMsg.pass ? 'good' : 'warn'} data-testid="ladder-msg"><b>{ladderMsg.pass ? '▲ ' : ''}{ladderMsg.text}</b></p>}
          {reviewMsg && <p className="small" data-testid="review-msg"><b>복습함</b> {reviewMsg}</p>}
          {saved && <p className="small muted" data-testid="run-saved">✓ {saved}</p>}
          {shiftRes.length > 0 && (
            <p className="small" data-testid="shift-stats">
              {P.breakNotes} {shiftOk.length}/{shiftRes.length}개 맞음{shiftMean !== null && <> · 평균 <b className={tone(shiftMean)}>±{Math.round(shiftMean)}센트</b></>}
              {shiftMean !== null && shiftMean > 15 ? ` — ${P.breakAdvice}` : ''}
            </p>
          )}
          <b>마디별 {view === 'rhythm' && rhythm ? '박자 (ms)' : '음정 (센트)'}</b>
          <div className="chips">
            {view === 'rhythm' && rhythm ? [...rhythm.byMeasure.entries()].map(([m, v]) => (
              <button key={m} className={`chip measure-chip ${rhythmTone(v)}`} onClick={() => setRange(m, m)} title="이 마디만 다시">
                {m}<small>±{Math.round((v * 60000) / rhythm.bpm)}</small>
              </button>
            )) : [...sum.byMeasure.entries()].map(([m, v]) => (
              <button key={m} className={`chip measure-chip ${tone(v)}`} onClick={() => setRange(m, m)} title="이 마디만 다시">
                {m}<small>{v === null ? '—' : `±${Math.round(v)}`}</small>
              </button>
            ))}
          </div>
          {view === 'rhythm' && rhythm && (
            <>
              <b>박자가 가장 벗어난 음</b>
              <table className="tbl" data-testid="rhythm-worst">
                <thead><tr><th>마디</th><th>음</th><th>박자</th></tr></thead>
                <tbody>{[...rhythm.notes].sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 6).map((n) => {
                  const r = result!.find((x) => `${x.note.measure}:${x.note.index}` === n.key);
                  const ms = Math.round((n.err * 60000) / rhythm.bpm);
                  return <tr key={n.key}><td>{n.measure}</td><td>{r ? midiName(r.note.midi) : ''}</td><td className={rhythmTone(n.err)}>{ms > 0 ? `${ms}ms 늦게` : `${-ms}ms 일찍`}</td></tr>;
                })}</tbody>
              </table>
              <p className="hint">템포가 조금씩 바뀌는 건 괜찮고, 주변 음들보다 혼자 당기거나 끄는 음을 찾아요. 초록 박의 6% 안, 노랑 12%, 빨강 그 이상.</p>
            </>
          )}
          {view === 'pitch' && worst.length > 0 && (
            <>
              <b>가장 벗어난 음</b>
              <table className="tbl">
                <thead><tr><th>마디</th><th>음</th><th>오차</th></tr></thead>
                <tbody>{worst.map((r) => (
                  <tr key={`${r.note.measure}:${r.note.index}`}><td>{r.note.measure}</td><td>{midiName(r.note.midi)}</td><td className={tone(Math.abs(r.cents!))}>{centsText(r.cents)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <button className="secondary wide" onClick={start}>같은 구간 다시</button>
          <p className="hint">마디 번호를 누르면 그 마디만 골라서 반복할 수 있어요.</p>
        </div>
      )}

      <RunHistory runs={runs} onPick={(r) => setRange(r.from, r.to)} onShow={showRun} shownId={pastRun?.id} />
      <ScoreProgress runs={runs} from={from} to={to} />
      {!ex && <LessonNotesCard scoreId={score.id!} scoreTitle={score.title} pieceId={score.pieceId} measure={from} onMeasure={(m) => setRange(m, m + (lenLock ?? span) - 1)} />}
      <div className="card" data-testid="acc-card">
        <b>파트 · 반주</b>
        {parsed.parts.length > 1 && (
          <>
            <div className="row-setting">
              <span>내 파트</span>
              <select value={myPart} onChange={(e) => { db.scores.update(score.id!, { part: Number(e.target.value) }); setResult(null); }} aria-label="내 파트" data-testid="my-part">
                {parsed.parts.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
            </div>
            <label className="small"><input type="checkbox" checked={!!score.showOthers} onChange={(e) => db.scores.update(score.id!, { showOthers: e.target.checked })} /> 다른 파트도 악보에 보이기</label>
          </>
        )}
        {score.accXml ? (
          <div className="rec-head">
            <span className="small">반주: <b>{score.accName || '반주 악보'}</b></span>
            <button className="mini danger" onClick={() => db.scores.update(score.id!, { accXml: undefined, accName: undefined })} aria-label="반주 지우기">✕</button>
          </div>
        ) : (
          <button className="secondary wide" onClick={() => accFile.current?.click()} data-testid="acc-attach">반주 악보 붙이기 (MusicXML)</button>
        )}
        <input ref={accFile} type="file" accept=".musicxml,.xml" hidden onChange={(e) => e.target.files?.[0] && attachAcc(e.target.files[0])} data-testid="acc-file" />
        {accError && <p className="error">{accError}</p>}
        <p className="hint">{hasAcc ? `반주 ${accParts.length}파트 · 피아노 파트는 피아노 소리, 그 밖은 ${P.sampleName} 소리로 들려줘요.` : '합주의 다른 파트나 피아노 반주 악보를 붙이면 같이 들으며 연습할 수 있어요. 마디 번호가 같은 악보여야 해요.'}</p>
      </div>

      </div>

      {editKey !== null && (() => {
        const [m, i] = editKey.split(':').map(Number);
        const nt = parsed.notes.find((x) => x.measure === m && x.index === i);
        return nt ? (
          <EditSheet keyName={editKey} midi={nt.midi} dur={nt.dur} msg={editMsg} canRevert={!!score.origXml}
            onOp={(op) => applyEdit(editKey, op)} onRevertBar={() => revertBar(editKey)} onClose={() => setEditKey(null)} />
        ) : null;
      })()}

      {hereKey !== null && (
        <div className="here-bar" data-testid="here-bar" role="dialog" aria-label="여기부터">
          <span className="small"><b>{hereKey.split(':')[0]}마디</b>부터 {lenLock ?? span}마디</span>
          <button className="primary" onClick={() => startFrom(hereKey, 'play')} data-testid="here-play">▶ 듣기</button>
          <button onClick={() => startFrom(hereKey, 'score')} disabled={!expected.length} data-testid="here-score">● 채점</button>
          <button className="mini" onClick={() => setHereKey(null)} aria-label="닫기">✕</button>
        </div>
      )}

      {(focus || playing || pausedAt !== null || listening) && !hereKey && !editKey && (
        <div className="float-ctl" data-testid="float-ctl" role="toolbar" aria-label="재생 조작">
          {listening ? (
            <>
              {playing && <span ref={beatDot} className="beat-dot" data-testid="beat-dot" aria-hidden />}
              {livePitch && <LivePitch a4={settings.a4} tol={tol} compact />}
              <span className="float-info"><span className="rec-dot" /> {liveDone}/{expected.length}음</span>
              <button className="primary" onClick={stop} data-testid="float-stop-score">■ 끝내고 채점</button>
            </>
          ) : !playing && pausedAt === null ? (
            <>
              <button className="mini" onClick={() => setRange(from - span, to - span)} disabled={from <= first} aria-label="앞 구간">‹</button>
              <span className="float-info">{from}~{to}마디</span>
              <button className="mini" onClick={() => setRange(from + span, to + span)} disabled={to >= last} aria-label="다음 구간">›</button>
              <button className="primary" onClick={() => { curIdx.current = 0; playRange(); }} disabled={!expected.length} data-testid="float-play">▶ 듣기</button>
              <button onClick={start} disabled={!expected.length} data-testid="float-score">● 채점</button>
            </>
          ) : (
            <>
              <span ref={beatDot} className="beat-dot" aria-hidden />
              <span className="float-info">{nowMeasure ?? from}마디 · ♩{playBpm}</span>
              <button className="mini" onClick={() => setPlayBpm((b) => Math.max(30, b - 5))} aria-label="느리게">−</button>
              <button className="mini" onClick={() => setPlayBpm((b) => Math.min(200, b + 5))} aria-label="빠르게">+</button>
              {playing
                ? <button className="primary" onClick={pausePlay} data-testid="float-pause">❚❚ 멈춤</button>
                : <button className="primary" onClick={resumePlay} data-testid="float-resume">▶ 이어서</button>}
              <button onClick={restartPlay} aria-label="처음부터" data-testid="float-restart">⏮</button>
              <button onClick={stopPlay} aria-label="정지" data-testid="float-stop">■</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}


function RecPlayer({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null, alive = true;
    db.recordings.get(id).then((r) => { if (r && alive) { u = URL.createObjectURL(r.blob); setUrl(u); } }).catch(() => {});
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <audio controls src={url} preload="metadata" className="player" /> : <p className="muted small">녹음이 지워졌어요.</p>;
}

/** 이 악보의 연습 기록 (최근 순) */
function RunHistory({ runs, onPick, onShow, shownId }: { runs: ScoreRun[]; onPick: (r: ScoreRun) => void; onShow: (r: ScoreRun) => void; shownId?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!runs.length) return null;
  const list = all ? runs : runs.slice(0, 5);
  return (
    <div className="card" data-testid="run-history">
      <div className="card-head"><b>이 악보 연습 기록 {runs.length}번</b></div>
      <ul className="rec-list">
        {list.map((r) => (
          <li key={r.id}>
            <div className="rec-head">
              <button className="link rec-title" onClick={() => setOpen(open === r.id ? null : r.id!)}>
                <b>{runText(r)}</b>
                <span className="muted small">{new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {clock(r.durationSec)}{r.bpm ? ` · ♩≈${r.bpm}` : ''}{r.recordingId ? ' · 녹음 있음' : ''}</span>
              </button>
              <button className="mini" onClick={() => onPick(r)} title="이 구간으로">구간</button>
              <button className="mini danger" onClick={() => { if (confirm('이 연습 기록을 지울까요? (녹음은 녹음 목록에 남아요)')) db.scoreRuns.delete(r.id!); }} aria-label="기록 삭제">✕</button>
            </div>
            {open === r.id && (
              <div className="rec-body">
                <RunInsightView run={r} />
                {r.notes?.length
                  ? <button className={`secondary wide ${shownId === r.id ? 'on' : ''}`} onClick={() => onShow(r)} data-testid="run-show">악보에서 분석 보기 (음표 색·높낮이·박자{r.notes.some((n) => n[5] != null) ? '·셈여림' : ''})</button>
                  : <p className="muted small">이 기록은 음마다 저장하기 전(v0.6 이전) 기록이라 요약만 있어요.</p>}
                {r.recordingId ? <RecPlayer id={r.recordingId} /> : <p className="muted small">녹음 없이 채점만 했어요.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {runs.length > 5 && <button className="link small" onClick={() => setAll(!all)}>{all ? '접기' : `전체 ${runs.length}개 보기`}</button>}
    </div>
  );
}

const DUR_TYPES: { type: NoteType; q: number; label: string }[] = [
  { type: 'whole', q: 4, label: '온' }, { type: 'half', q: 2, label: '2분' }, { type: 'quarter', q: 1, label: '4분' }, { type: 'eighth', q: 0.5, label: '8분' }, { type: '16th', q: 0.25, label: '16분' },
];
/** 음표 하나 고치기: 높이·길이·쉼표 */
function EditSheet({ keyName, midi, dur, msg, canRevert, onOp, onRevertBar, onClose }: {
  keyName: string; midi: number; dur: number; msg: string; canRevert: boolean;
  onOp: (op: EditOp) => void; onRevertBar: () => void; onClose: () => void;
}) {
  const [measure, idx] = keyName.split(':');
  const cur = DUR_TYPES.find((d) => Math.abs(d.q - dur) < 1e-6 || Math.abs(d.q * 1.5 - dur) < 1e-6);
  const dotted = !!cur && Math.abs(cur.q * 1.5 - dur) < 1e-6 && Math.abs(cur.q - dur) > 1e-6;
  return (
    <div className="mark-sheet" data-testid="edit-sheet" role="dialog" aria-label="음 고치기">
      <div className="card-head"><b>{measure}마디 {Number(idx) + 1}번째 음 · <span data-testid="edit-note">{prettyName(midi)}</span></b><button className="mini" onClick={onClose} data-testid="edit-close">닫기</button></div>
      <div className="mark-row">
        <span className="muted small">높이</span>
        <button className="chip" onClick={() => onOp({ kind: 'shift', semis: -1 })} data-testid="edit-down">반음 ↓</button>
        <button className="chip" onClick={() => onOp({ kind: 'shift', semis: 1 })} data-testid="edit-up">반음 ↑</button>
        <button className="chip" onClick={() => onOp({ kind: 'shift', semis: -12 })}>옥타브 ↓</button>
        <button className="chip" onClick={() => onOp({ kind: 'shift', semis: 12 })}>옥타브 ↑</button>
      </div>
      <div className="mark-row">
        <span className="muted small">길이</span>
        {DUR_TYPES.map((d) => (
          <button key={d.type} className={`chip ${cur?.type === d.type ? 'on' : ''}`} onClick={() => onOp({ kind: 'dur', type: d.type, dot: dotted })}>{d.label}</button>
        ))}
        <button className={`chip ${dotted ? 'on' : ''}`} disabled={!cur} onClick={() => cur && onOp({ kind: 'dur', type: cur.type, dot: !dotted })}>점</button>
      </div>
      {msg && <p className="error small" data-testid="edit-msg">{msg}</p>}
      <div className="session-controls">
        <button className="danger" onClick={() => onOp({ kind: 'rest' })} data-testid="edit-rest">쉼표로 바꾸기</button>
        {canRevert && <button className="secondary" onClick={onRevertBar} data-testid="edit-revert-bar">이 마디 되돌리기</button>}
      </div>
      <p className="hint">음 이름은 악보음이에요. 짧게 하면 뒤에 쉼표가 생기고, 길게 하려면 바로 뒤에 쉼표가 있어야 해요. 붙임줄·셋잇단 음은 높이만 고칠 수 있어요.</p>
    </div>
  );
}
