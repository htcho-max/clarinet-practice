import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type ExerciseProgress, type ScoreFile } from '../data/db';
import { STAGES, STEPS, PATTERNS, RANGE_SETS, MINOR_FORMS, scaleProgressId, makeExercise, type ExerciseSpec, type PatternId, type RangeSet, type Step } from '../exercise/curriculum';
import { BOWINGS, RHYTHMS, type Bowing } from '../exercise/build';
import { ALL_KEYS, MAJOR_KEYS, MINOR_KEYS, keyById, type MinorForm } from '../exercise/theory';
import { ART_BASES, ART_KEYS, ART_VARIANTS, artProgressId, variantById, type ArtBaseId } from '../exercise/articulation';

export interface ExerciseOptions { perBeat: number; bowing: Bowing }
const DEFAULT_OPTS: ExerciseOptions = { perBeat: 1, bowing: 'detache' };
export function loadOpts(): ExerciseOptions {
  try { return { ...DEFAULT_OPTS, ...JSON.parse(localStorage.getItem('clarinet-exercise-opts') || '{}') }; } catch { return DEFAULT_OPTS; }
}
function saveOpts(o: ExerciseOptions) { try { localStorage.setItem('clarinet-exercise-opts', JSON.stringify(o)); } catch { /* 무시 */ } }

export function useProgress(): Record<string, ExerciseProgress> {
  const [p, setP] = useState<Record<string, ExerciseProgress>>({});
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get('exercise-progress')).subscribe({ next: (r) => setP((r?.value as Record<string, ExerciseProgress>) ?? {}), error: () => {} });
    return () => sub.unsubscribe();
  }, []);
  return p;
}
/** 통과 기준: 맞은 음 90% 이상, 평균 ±15센트 안 (입문 곡은 ±20) */
export async function recordProgress(stepId: string, pct: number, mean: number | null, bpm: number) {
  const row = await db.kv.get('exercise-progress');
  const all = { ...((row?.value as Record<string, ExerciseProgress>) ?? {}) };
  const prev = all[stepId];
  const limit = /^[AB]\d/.test(stepId) ? 20 : 15;
  const passed = pct >= 90 && mean !== null && mean <= limit;
  all[stepId] = {
    best: Math.max(prev?.best ?? 0, pct),
    mean: mean === null ? prev?.mean ?? null : prev?.mean == null ? mean : Math.min(prev.mean, mean),
    passed: (prev?.passed ?? false) || passed,
    bpm: passed ? Math.max(prev?.bpm ?? 0, bpm) : prev?.bpm,
    at: Date.now(),
    tries: (prev?.tries ?? 0) + 1,
  };
  await db.kv.put({ key: 'exercise-progress', value: all });
  return passed;
}

/** 연습곡을 만들어 저장하고 id 를 돌려줌 (같은 단계는 한 장을 덮어씀) */
export async function createExercise(stepId: string, spec: ExerciseSpec, o: ExerciseOptions, seed: number, tempo: number, tip?: string, title?: string, progressId?: string): Promise<number> {
  const m = makeExercise(spec, { ...o, seed, tempo, title });
  if (m.error || !m.xml) throw new Error(m.error ?? '연습곡을 만들지 못했어요.');
  const existing = await db.scores.where('exercise.stepId').equals(stepId).first();
  const rec: Omit<ScoreFile, 'id'> = { title: m.title, xml: m.xml, createdAt: Date.now(), exercise: { stepId, spec, seed, breakKeys: m.breakKeys, tip, tempo, progressId } };
  if (existing?.id) { await db.scores.update(existing.id, { ...rec, lastFrom: undefined, lastTo: undefined }); return existing.id; }
  return db.scores.add(rec as ScoreFile);
}

/** 텅잉(아티큘레이션) 연습 한 장 만들기 (모두 한 장을 덮어씀) */
export function createArt(base: ArtBaseId, key: string, variant: string, o: ExerciseOptions, tempo = 60): Promise<number> {
  const v = variantById(variant);
  const b = ART_BASES.find((x) => x.id === base)!;
  return createExercise('art', { key, pattern: 'art', positions: base === 'five' ? 'low' : 'cross', base, variant: v.id }, o, 1, tempo, `${v.tip} ${b.tip}`, undefined, artProgressId(base, key, v.id));
}

/** 장·단음계 악보 (한 장을 덮어씀). 조·형태·옥타브마다 진도는 따로 */
export interface SheetPrefs { mode: 'major' | 'minor'; form: MinorForm; octaves: number }
export function sheetPrefs(): SheetPrefs {
  try { return { mode: 'major', form: 'harmonic', octaves: 2, ...JSON.parse(localStorage.getItem('clarinet-scale-sheet') || '{}') }; } catch { return { mode: 'major', form: 'harmonic', octaves: 2 }; }
}
export const saveSheetPrefs = (p: SheetPrefs) => { try { localStorage.setItem('clarinet-scale-sheet', JSON.stringify(p)); } catch { /* 무시 */ } };
export const SHEET_TIP = '교재처럼 음계를 오르내린 뒤 으뜸화음(1·3·5음)을 오르내려요. 악보 위 "♯♭ 표시"를 켜면 바뀌는 음에 형광펜이 칠해져요.';
export function createSheet(key: string, form: MinorForm, octaves: number, o: ExerciseOptions, tempo = 60): Promise<number> {
  const minor = keyById(key).mode === 'minor';
  return createExercise('scales', { key, pattern: 'scaleSheet', positions: 'full', octaves, ...(minor ? { form } : {}) }, o, 1, tempo, SHEET_TIP, undefined, scaleProgressId(key, minor ? form : undefined, octaves));
}

/** 다른 탭(오늘의 연습)에서 악보 탭을 열며 연습곡을 바로 열 때 */
let pending: { fn: () => Promise<number>; exercises: boolean } | null = null;
/** exercises = 닫으면 연습곡 목록으로 (내 악보를 열 때는 false) */
export const requestOpen = (fn: () => Promise<number>, exercises = true) => { pending = { fn, exercises }; };
export const takePending = () => { const p = pending; pending = null; return p; };

export function artPrefs(): { base: ArtBaseId; key: string } {
  try { return { base: (localStorage.getItem('clarinet-art-base') as ArtBaseId) || 'five', key: localStorage.getItem('clarinet-art-key') || 'C' }; } catch { return { base: 'five', key: 'C' }; }
}
/** 다음에 할 단계 (아직 통과 못 한 첫 단계) 와 텅잉 변형 */
export function nextSuggestions(progress: Record<string, ExerciseProgress>) {
  const step = STEPS.find((s) => !progress[s.id]?.passed) ?? STEPS[STEPS.length - 1];
  const { base, key } = artPrefs();
  const variant = ART_VARIANTS.find((v) => !progress[artProgressId(base, key, v.id)]?.passed) ?? ART_VARIANTS[0];
  return { step, art: { base, key, variant, baseLabel: ART_BASES.find((b) => b.id === base)!.label } };
}
export async function openStep(step: Step, o = loadOpts()): Promise<number> {
  const prev = await db.scores.where('exercise.stepId').equals(step.id).first();
  const seed = (prev?.exercise?.seed ?? 0) + (prev ? 0 : 1);
  return createExercise(step.id, step.spec, o, seed, step.tempo, step.tip);
}

export function Exercises({ onOpen, onBack }: { onOpen: (id: number) => void; onBack: () => void }) {
  const [opts, setOpts] = useState<ExerciseOptions>(loadOpts);
  const progress = useProgress();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<{ key: string; pattern: PatternId; range: RangeSet }>({ key: 'C', pattern: 'scale', range: 'low' });
  const [artBase, setArtBase] = useState<ArtBaseId>(() => artPrefs().base);
  const [artKey, setArtKey] = useState(() => artPrefs().key);
  useEffect(() => { try { localStorage.setItem('clarinet-art-base', artBase); localStorage.setItem('clarinet-art-key', artKey); } catch { /* 무시 */ } }, [artBase, artKey]);
  async function openArt(variant: string) {
    setError(null); setBusy(true);
    try { onOpen(await createArt(artBase, artKey, variant, opts)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const artDone = ART_VARIANTS.filter((v) => progress[artProgressId(artBase, artKey, v.id)]?.passed).length;
  const set = (p: Partial<ExerciseOptions>) => { const n = { ...opts, ...p }; setOpts(n); saveOpts(n); };
  const [sheet, setSheet] = useState<SheetPrefs>(sheetPrefs);
  const setSh = (p: Partial<SheetPrefs>) => { const n = { ...sheet, ...p }; setSheet(n); saveSheetPrefs(n); };
  async function openSheet(key: string) {
    setError(null); setBusy(true);
    try { onOpen(await createSheet(key, sheet.form, sheet.octaves, opts)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const sheetKeys = sheet.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;

  async function open(step: Step, newSeed = false) {
    setError(null); setBusy(true);
    try {
      if (!newSeed) { onOpen(await openStep(step, opts)); return; }
      const prev = await db.scores.where('exercise.stepId').equals(step.id).first();
      onOpen(await createExercise(step.id, step.spec, opts, (prev?.exercise?.seed ?? 0) + 1, step.tempo, step.tip));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function openCustom() {
    setError(null); setBusy(true);
    try {
      const spec: ExerciseSpec = { key: custom.key, pattern: custom.pattern, positions: custom.range, octaves: 2 };
      onOpen(await createExercise('custom', spec, opts, Math.floor(Math.random() * 1000) + 1, 60));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const done = STEPS.filter((s) => progress[s.id]?.passed).length;

  return (
    <section className="page score exercises">
      <div className="card-head">
        <button className="mini" onClick={onBack}>◀ 목록</button>
        <b className="score-title">연습곡 · 쉬운 곡</b>
      </div>

      <div className="card">
        <p className="hint">앱이 만드는 연습곡이에요. 악보 화면에서 듣기·채점을 그대로 쓸 수 있어요. 처음부터 끝까지 맞은 음 90% 이상, 평균 ±15센트 안이면 통과(1·2단계는 ±20센트). <b>{done}/{STEPS.length} 통과</b></p>
        <b className="small">음계 리듬 (단계가 정하지 않은 것만)</b>
        <div className="segmented small">
          {RHYTHMS.map((r) => <button key={r.perBeat} className={opts.perBeat === r.perBeat ? 'on' : ''} onClick={() => set({ perBeat: r.perBeat })}>{r.label}</button>)}
        </div>
        <b className="small">아티큘레이션</b>
        <select value={opts.bowing} onChange={(e) => set({ bowing: e.target.value as Bowing })} aria-label="아티큘레이션">
          {BOWINGS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card" data-testid="sheet-card">
        <b>장·단음계 악보 (12조)</b>
        <p className="hint">조를 누르면 음계 악보가 열려요. 악보 화면에서 이전·다음 조로 바로 넘어갈 수 있어요. 리듬·아티큘레이션은 위 설정을 따라요.</p>
        <div className="segmented small">
          <button className={sheet.mode === 'major' ? 'on' : ''} onClick={() => setSh({ mode: 'major' })} data-testid="sheet-major">장조</button>
          <button className={sheet.mode === 'minor' ? 'on' : ''} onClick={() => setSh({ mode: 'minor' })} data-testid="sheet-minor">단조</button>
        </div>
        {sheet.mode === 'minor' && (
          <div className="segmented small">
            {MINOR_FORMS.map((f) => <button key={f.id} className={sheet.form === f.id ? 'on' : ''} onClick={() => setSh({ form: f.id })} data-testid={`sheet-form-${f.id}`}>{f.label}단음계</button>)}
          </div>
        )}
        <div className="row-setting">
          <span>높이</span>
          {[1, 2].map((n) => <button key={n} className={`chip ${sheet.octaves === n ? 'on' : ''}`} onClick={() => setSh({ octaves: n })}>{n}옥타브</button>)}
        </div>
        <div className="chips sheet-keys">
          {sheetKeys.map((k) => {
            const pr = progress[scaleProgressId(k.id, k.mode === 'minor' ? sheet.form : undefined, sheet.octaves)];
            return <button key={k.id} className={`chip ${pr?.passed ? 'passed' : ''}`} onClick={() => openSheet(k.id)} disabled={busy} data-testid={`sheet-${k.id}`}>{pr?.passed ? '✓ ' : ''}{k.name}</button>;
          })}
        </div>
        {sheet.mode === 'minor' && <p className="hint">자연단음계는 조표 그대로, 화성단음계는 7음을, 가락단음계는 올라갈 때 6·7음을 올려요(내려올 때는 자연).</p>}
      </div>

      {STAGES.map((st) => (
        <div className="card" key={st.id}>
          <b>{st.title}</b>
          <p className="hint">{st.desc}</p>
          <ul className="rec-list">
            {STEPS.filter((s) => s.stage === st.id).map((s) => {
              const pr = progress[s.id];
              return (
                <li key={s.id}>
                  <div className="rec-head">
                    <button className="link rec-title" onClick={() => open(s)} disabled={busy} data-testid={`ex-${s.id}`}>
                      <b>{pr?.passed ? '✓ ' : ''}{s.title}</b>
                      <span className="muted small">{pr ? `최고 ${pr.best}%${pr.mean !== null ? ` · ±${Math.round(pr.mean)}센트` : ''}${pr.bpm ? ` · ♩=${pr.bpm} 통과` : ''}` : `♩=${s.tempo}부터`}</span>
                    </button>
                    {s.spec.pattern === 'etude' && <button className="mini" onClick={() => open(s, true)} disabled={busy} title="새 에튀드 만들기">새 곡</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="card" data-testid="art-card">
        <b>텅잉 · 슬러 연습 (아티큘레이션)</b>
        <p className="hint">짧은 악구 하나를 16가지 텅잉·슬러 조합으로 바꿔 가며 연습해요. 채점은 음정만 하고, 혀와 슬러는 녹음해서 들어 보세요. 기초 탭의 "텅잉"에서 박에 맞춰 혀를 쓰는지도 잴 수 있어요. <b>이 악구 {artDone}/{ART_VARIANTS.length} 통과</b></p>
        <div className="row-setting">
          <select value={artBase} onChange={(e) => setArtBase(e.target.value as ArtBaseId)} aria-label="기본 악구" data-testid="art-base">
            {ART_BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select value={artKey} onChange={(e) => setArtKey(e.target.value)} aria-label="조">
            {ART_KEYS.map((k) => <option key={k} value={k}>{keyById(k).name}</option>)}
          </select>
        </div>
        <ul className="rec-list">
          {ART_VARIANTS.map((v) => {
            const pr = progress[artProgressId(artBase, artKey, v.id)];
            return (
              <li key={v.id}>
                <div className="rec-head">
                  <button className="link rec-title" onClick={() => openArt(v.id)} disabled={busy} data-testid={`art-${v.id}`}>
                    <b>{pr?.passed ? '✓ ' : ''}{v.id}. {v.label}</b>
                    {pr && <span className="muted small">최고 {pr.best}%{pr.bpm ? ` · ♩=${pr.bpm} 통과` : ''}</span>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <b>직접 만들기</b>
        <div className="row-setting">
          <select value={custom.key} onChange={(e) => setCustom({ ...custom, key: e.target.value })} aria-label="조">
            {ALL_KEYS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          <select value={custom.pattern} onChange={(e) => setCustom({ ...custom, pattern: e.target.value as PatternId })} aria-label="패턴">
            {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <select value={custom.range} onChange={(e) => setCustom({ ...custom, range: e.target.value as RangeSet })} aria-label="음역">
          {RANGE_SETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="secondary wide" onClick={openCustom} disabled={busy} data-testid="ex-custom">만들기</button>
        <p className="hint">직접 만든 연습곡은 한 장만 저장돼요 (새로 만들면 바뀌어요).</p>
      </div>
    </section>
  );
}
