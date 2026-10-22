import { useEffect, useMemo, useRef, useState } from 'react';
import { P, fingeringFor, describeKeys } from '../instruments/profiles';
import { InstrumentDiagram, DIAGRAM_HORIZONTAL } from '../components/InstrumentDiagram';
import { MiniStaff } from '../components/MiniStaff';
import { CentsGauge, centsText } from '../components/CentsGauge';
import { freqToNote, midiToFreq, prettyName, soundingMidi, NOTE_NAMES_KO, NOTE_NAMES, INSTRUMENTS } from '../audio/notes';
import { playTone } from '../audio/tone';
import { usePitch } from '../state/usePitch';
import { useSettings } from '../state/settings';
import { useWakeLock } from '../state/wakeLock';
import { useBackLayer } from '../state/back';
import { requestScore, takeFingeringRequest, type FingeringRequest } from '../state/openRequest';
import type { TabId } from '../components/TabBar';
import { tolFor } from '../score/tolerance';
import { LITE } from '../state/lite';
import { MAJOR_KEYS } from '../exercise/theory';
import { nextTarget, notesInKey, type RunMode } from '../exercise/fingerRun';

type Range = 'all' | 'low' | 'mid' | 'high';
const RANGES = P.fgRanges;
const FINGERINGS = [...P.fingerings].sort((a, b) => a.midi - b.midi);
const ALL_MIDIS = FINGERINGS.map((n) => n.midi);
type Mode = 'chart' | 'quiz';
/** 불어 보기: 부는 음의 운지로 바뀜(따라가기) / 고른 음을 맞게 불면 다음 음(목표 연습) */
type Blow = 'follow' | 'practice';
const HOLD_MS = 500;

const koName = (midi: number) => NOTE_NAMES_KO[NOTE_NAMES[((midi % 12) + 12) % 12]];
const shortReg = (label: string) => label.replace(/ \(.*\)$/, '');
const rangeOf = (id: Range) => (id === 'all' ? { lo: ALL_MIDIS[0], hi: ALL_MIDIS[ALL_MIDIS.length - 1] } : RANGES.find((x) => x.id === id)!);
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

/** 음역별로 묶은 음 줄 (샬뤼모·스로트·클라리온·알티시모 / 1·2·3옥타브) */
const GROUPS = (() => {
  const out: { id: string; label: string; notes: number[] }[] = [];
  for (const m of ALL_MIDIS) {
    const r = P.registerOf(m);
    const last = out[out.length - 1];
    if (last && last.id === r.id) last.notes.push(m); else out.push({ id: r.id, label: shortReg(r.label), notes: [m] });
  }
  return out;
})();

export function Fingering({ go }: { go?: (t: TabId) => void } = {}) {
  const { settings } = useSettings();
  const tol = tolFor(settings.pitchTolerance);
  const [range, setRange] = useState<Range>(() => { try { const v = localStorage.getItem('clarinet-fg-range') as Range; return v === 'all' || RANGES.some((x) => x.id === v) ? v : 'low'; } catch { return 'low'; } });
  const [prange, setPrangeS] = useState<Range>(() => load<Range>('clarinet-fg-prange', 'all'));
  const setPrange = (v: Range) => { setPrangeS(v); save('clarinet-fg-prange', v); };
  const [sel, setSel] = useState(P.longDefault);
  const [initAlt, setInitAlt] = useState(0);
  const [mode, setMode] = useState<Mode>('chart');
  const [blow, setBlowS] = useState<Blow>(() => load<Blow>('clarinet-fg-blow', 'follow'));
  const setBlow = (b: Blow) => { setBlowS(b); save('clarinet-fg-blow', b); };
  const [run, setRunS] = useState<RunMode>(() => load<RunMode>('clarinet-fg-run', 'up'));
  const setRun = (r: RunMode) => { setRunS(r); save('clarinet-fg-run', r); };
  const [keyId, setKeyIdS] = useState(() => load('clarinet-fg-key', P.id === 'flute' ? 'G' : 'C'));
  const setKeyId = (k: string) => { setKeyIdS(k); save('clarinet-fg-key', k); };
  const [auto, setAutoS] = useState(() => load('clarinet-fg-auto', true));
  const setAuto = (v: boolean) => { setAutoS(v); save('clarinet-fg-auto', v); };
  const pitch = usePitch(settings.minDb);
  useWakeLock(pitch.on, settings.wakeLock);
  useEffect(() => { try { localStorage.setItem('clarinet-fg-range', range); } catch { /* 무시 */ } }, [range]);
  // 휴대폰 뒤로 가기: 퀴즈 → 운지표
  useBackLayer(mode === 'quiz', () => setMode('chart'));
  const pick = (m: number, alt = 0) => { setSel(m); setInitAlt(alt); };
  // 악보에서 음표를 길게 눌러 왔을 때: 그 음(과 고른 운지)을 보여주고, "◀ 악보로" 돌아가기
  const [ret, setRet] = useState<FingeringRequest['back'] | null>(null);
  const [fgMsg, setFgMsg] = useState<string | null>(null);
  useEffect(() => {
    const q = takeFingeringRequest();
    if (!q) return;
    setMode('chart');
    if (fingeringFor(q.midi)) {
      pick(q.midi, q.alt ?? 0); setFgMsg(null);
      if (blow === 'follow') setBlowS('practice'); // 부는 음으로 바뀌지 않게 (저장은 안 함)
      const r = rangeOf(prange);
      if (q.midi < r.lo || q.midi > r.hi) setPrange('all');
    } else setFgMsg(`${prettyName(q.midi)}은(는) ${P.name} 운지표에 없는 음이에요.`);
    setRet(q.back ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const backToScore = () => {
    if (!ret) return;
    requestScore({ scoreId: ret.scoreId, measure: ret.from, to: ret.to });
    setRet(null);
    go?.('score');
  };
  useBackLayer(!!ret && !!go, backToScore);

  const r = rangeOf(range); // 퀴즈 범위
  const pr = rangeOf(prange); // 맞히기 연습 범위
  const pool = useMemo(() => ALL_MIDIS.filter((m) => m >= pr.lo && m <= pr.hi), [pr.lo, pr.hi]);
  const key = MAJOR_KEYS.find((k) => k.id === keyId) ?? MAJOR_KEYS[0];
  const freq = pitch.reading?.freq ?? null;
  const heard = freq ? freqToNote(freq, settings.a4) : null;
  const heardOk = heard && fingeringFor(heard.midi) ? heard : null;

  // 음 줄: 고른 음이 보이게 가로로 (페이지는 움직이지 않게 scrollTo)
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current, b = el?.querySelector<HTMLElement>(`[data-midi="${sel}"]`);
    if (!el || !b) return;
    const left = b.offsetLeft - el.clientWidth / 2 + b.offsetWidth / 2;
    try { el.scrollTo({ left, behavior: LITE ? 'auto' : 'smooth' }); } catch { el.scrollLeft = left; }
  }, [sel, mode]);

  // 따라가기: 부는 음을 0.25초 이상 같은 음으로 내면 그 음의 운지로
  const stable = useRef<{ midi: number; since: number } | null>(null);
  useEffect(() => {
    if (mode !== 'chart' || blow !== 'follow' || !heardOk) { stable.current = null; return; }
    const now = performance.now();
    if (stable.current?.midi !== heardOk.midi) stable.current = { midi: heardOk.midi, since: now };
    else if (now - stable.current.since > 250 && sel !== heardOk.midi) pick(heardOk.midi);
  }, [heardOk?.midi, pitch.reading, mode, blow]); // eslint-disable-line react-hooks/exhaustive-deps

  // 목표 연습: 고른 음을 판정 기준(노랑) 안으로 0.5초 → 맞음, 켜 두면 다음 음으로
  const [hold, setHold] = useState(0);
  const [hit, setHit] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const holdSince = useRef<number | null>(null);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (nextTimer.current) clearTimeout(nextTimer.current); }, []);
  useEffect(() => { holdSince.current = null; setHold(0); setHit(null); }, [sel]);
  const onTarget = !!heard && heard.midi === sel && Math.abs(heard.cents) <= tol.warn;
  useEffect(() => {
    if (mode !== 'chart' || blow !== 'practice' || hit !== null) return;
    if (!onTarget) { holdSince.current = null; setHold(0); return; }
    const now = performance.now();
    if (holdSince.current === null) holdSince.current = now;
    const h = Math.min(1, (now - holdSince.current) / HOLD_MS);
    setHold(h);
    if (h >= 1) {
      setHit(sel); setHits((x) => x + 1);
      if (auto) {
        const nx = nextTarget(run, pool, sel, key);
        nextTimer.current = setTimeout(() => { nextTimer.current = null; if (nx !== null) pick(nx); }, 700);
      } else nextTimer.current = setTimeout(() => { nextTimer.current = null; holdSince.current = null; setHold(0); setHit(null); }, 1200);
    }
  }, [pitch.reading, mode, blow]); // eslint-disable-line react-hooks/exhaustive-deps
  const goNext = (d: 1 | -1 = 1) => {
    const list = run === 'key' ? notesInKey(pool, key) : pool;
    if (d === 1) { const nx = nextTarget(run, pool, sel, key); if (nx !== null) pick(nx); return; }
    const s = [...list].reverse(); pick(s.find((m) => m < sel) ?? s[0] ?? sel);
  };

  const inst = INSTRUMENTS.find((i) => i.id === settings.instrument)!;
  const inRun = run === 'key' ? new Set(notesInKey(pool, key)) : new Set(pool);

  return (
    <section className={`page fingering-page ${mode === 'chart' ? 'fg-chart' : 'fg-quizmode'}`}>
      {ret && go && <button className="secondary fc-back" onClick={backToScore} data-testid="fc-back-score">◀ 악보로 ({ret.title} {ret.measure}마디)</button>}
      {fgMsg && <p className="hint" data-testid="fg-msg">{fgMsg}</p>}
      <div className="segmented">
        <button className={mode === 'chart' ? 'on' : ''} onClick={() => setMode('chart')}>운지표</button>
        <button className={mode === 'quiz' ? 'on' : ''} onClick={() => setMode('quiz')} data-testid="quiz-tab">운지 퀴즈</button>
      </div>

      {mode === 'chart' ? (
        <>
          <div className="card fg-strip-card">
            <div className="fg-strip" ref={strip} data-testid="fg-grid" aria-label="음 고르기">
              {GROUPS.map((g) => (
                <div key={g.id} className="fg-group">
                  <span className="fg-group-label">{g.label}</span>
                  <div className="fg-group-notes">
                    {g.notes.map((m) => (
                      <button key={m} data-midi={m} aria-pressed={sel === m}
                        className={`chip ${sel === m ? 'on' : ''} ${heardOk?.midi === m ? 'heard' : ''} ${blow === 'practice' && !inRun.has(m) ? 'dim' : ''} ${hit === m ? 'hit' : ''}`}
                        onClick={() => pick(m)}>
                        {prettyName(m)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="hint fg-model">{P.id === 'flute' ? '야마하 YFL-222 (커버드 키, 오프셋 G, C 풋) 기준 운지예요. 칠해진 키를 눌러요.' : '뷔페 B12 (17키 6링 뵘식) 기준 운지예요. 칠해진 곳을 막거나 눌러요.'} 음 줄은 옆으로 넘겨요.</p>
          </div>

          <NoteCard midi={sel} a4={settings.a4} instLabel={inst.label} initAlt={initAlt} />

          <div className={`card fg-practice ${hit !== null ? 'quiz-ok' : ''}`} data-testid="fg-practice">
            <div className="card-head">
              <b>불어 보기</b>
              <button className={`mini ${pitch.on ? 'on' : ''}`} onClick={pitch.on ? pitch.stop : pitch.start}>{pitch.on ? '마이크 끄기' : '마이크 켜기'}</button>
            </div>
            <div className="segmented small">
              <button className={blow === 'follow' ? 'on' : ''} onClick={() => setBlow('follow')} data-testid="fg-follow">부는 음 따라가기</button>
              <button className={blow === 'practice' ? 'on' : ''} onClick={() => setBlow('practice')} data-testid="fg-practice-mode">고른 음 맞히기</button>
            </div>
            <div className="drone-reading">
              <span className={`note-mid ${onTarget ? 'good' : ''}`} data-testid="fg-heard">{heard ? prettyName(heard.midi) : '—'}</span>
              <span className="muted">{heard ? koName(heard.midi) : pitch.on ? '소리를 내 주세요' : '마이크를 켜면 부는 음을 알려줘요'}</span>
              <span className="cents-num">{centsText(heard?.cents ?? null)}<small> 센트</small></span>
            </div>
            <CentsGauge cents={heard?.cents ?? null} />
            {blow === 'practice' ? (
              <>
                <div className="fg-target">
                  <span>목표 <b>{prettyName(sel)}</b></span>
                  <span className="fg-hold" aria-hidden><span style={{ width: `${Math.round(hold * 100)}%` }} /></span>
                  <span className="small" data-testid="fg-status">{hit !== null ? `맞았어요! (${hits})` : heard && heard.midi !== sel ? `지금 ${prettyName(heard.midi)}` : onTarget ? '그대로…' : `±${tol.warn}센트 안으로 ${HOLD_MS / 1000}초`}</span>
                </div>
                <div className="row-setting fg-run">
                  <select value={run} onChange={(e) => setRun(e.target.value as RunMode)} aria-label="다음 음" data-testid="fg-run">
                    <option value="up">반음씩 위로</option>
                    <option value="key">이 조 음계</option>
                    <option value="random">무작위</option>
                  </select>
                  {run === 'key' && (
                    <select value={key.id} onChange={(e) => setKeyId(e.target.value)} aria-label="조" data-testid="fg-key">
                      {MAJOR_KEYS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  )}
                  <select value={prange} onChange={(e) => setPrange(e.target.value as Range)} aria-label="연습 범위" data-testid="fg-range">
                    <option value="all">전체 음역</option>
                    {RANGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
                <div className="row-setting">
                  <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} data-testid="fg-auto" /> 맞히면 다음 음으로</label>
                  <span className="session-controls">
                    <button className="mini" onClick={() => goNext(-1)} aria-label="이전 음">◀</button>
                    <button className="mini" onClick={() => goNext(1)} data-testid="fg-next" aria-label="다음 음">▶</button>
                  </span>
                </div>
              </>
            ) : <p className="hint">부는 음을 0.25초 이상 내면 그 음의 운지로 바뀌어요.</p>}
            {pitch.error && <p className="error">{pitch.error}</p>}
          </div>
        </>
      ) : (
        <>
          <div className="row-setting">
            <span>퀴즈 범위</span>
            <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="퀴즈 범위">
              <option value="all">전체 음역</option>
              {RANGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <Quiz lo={r.lo} hi={r.hi} pitch={pitch} a4={settings.a4} />
        </>
      )}
    </section>
  );
}

function NoteCard({ midi, a4, instLabel, initAlt = 0 }: { midi: number; a4: number; instLabel: string; initAlt?: number }) {
  const n = fingeringFor(midi);
  const [alt, setAlt] = useState(initAlt);
  useEffect(() => setAlt(initAlt), [midi, initAlt]);
  if (!n) return null;
  const all = [n.main, ...n.alts];
  const cur = all[Math.min(alt, all.length - 1)];
  const reg = P.registerOf(midi);
  const real = soundingMidi(midi);
  return (
    <div className="card fg-card" data-testid="fg-card">
      <div className="fg-top">
        <div className="fg-info">
          <div className="note-big small-big">{prettyName(midi)}</div>
          <div className="muted">{koName(midi)} · {reg.label}</div>
          {real !== midi && <div className="muted small">{instLabel}의 실제 소리는 {prettyName(real)}</div>}
          <MiniStaff notes={[midi]} width={120} />
          <button className="secondary" onClick={() => playTone(midiToFreq(midi, a4), 1.6)}>▶ 소리 듣기</button>
        </div>
        {!DIAGRAM_HORIZONTAL && <InstrumentDiagram keys={cur.keys} size={150} />}
      </div>
      {DIAGRAM_HORIZONTAL && <div className="fg-wide"><InstrumentDiagram keys={cur.keys} size={160} /></div>}
      {all.length > 1 && (
        <div className="segmented small">
          {all.map((x, i) => <button key={i} className={alt === i ? 'on' : ''} onClick={() => setAlt(i)}>{i === 0 ? '기본 운지' : `다른 운지 ${i}`}</button>)}
        </div>
      )}
      <p className="small fg-desc">{describeKeys(cur.keys)}{cur.note ? ` (${cur.note})` : ''}</p>
      {n.tip && alt === 0 && <p className="hint"><b>팁</b> {n.tip}</p>}
      {midi >= P.fgRanges[2].lo && <p className="hint">{P.highNote}</p>}
    </div>
  );
}

/** 운지 퀴즈: 오선의 음을 보고 불기. 0.4초 이상 맞는 음이 나면 정답 */
function Quiz({ lo, hi, pitch, a4 }: { lo: number; hi: number; pitch: ReturnType<typeof usePitch>; a4: number }) {
  const pool = useMemo(() => FINGERINGS.filter((n) => n.midi >= lo && n.midi <= hi).map((n) => n.midi), [lo, hi]);
  const pick = (prev?: number) => { let m = pool[Math.floor(Math.random() * pool.length)]; if (pool.length > 1) while (m === prev) m = pool[Math.floor(Math.random() * pool.length)]; return m; };
  const [target, setTarget] = useState(() => pick());
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState({ ok: 0, tries: 0, hints: 0 });
  const [flash, setFlash] = useState<string | null>(null);
  const since = useRef<number | null>(null);
  const t0 = useRef(performance.now());
  const times = useRef<number[]>([]);
  useEffect(() => { setTarget(pick()); setHint(false); }, [lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const freq = pitch.reading?.freq ?? null;
  const heard = freq ? freqToNote(freq, a4) : null;
  useEffect(() => {
    if (!heard || flash) { since.current = null; return; }
    if (heard.midi !== target) { since.current = null; return; }
    const now = performance.now();
    if (since.current === null) since.current = now;
    else if (now - since.current > 400) {
      times.current.push((now - t0.current) / 1000);
      setScore((s) => ({ ok: s.ok + 1, tries: s.tries + 1, hints: s.hints + (hint ? 1 : 0) }));
      setFlash(`정답! ${prettyName(target)}`);
      setTimeout(() => { setFlash(null); setHint(false); setTarget((t) => pick(t)); t0.current = performance.now(); since.current = null; }, 900);
    }
  }, [pitch.reading]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = fingeringFor(target)!;
  const avg = times.current.length ? times.current.reduce((a, b) => a + b, 0) / times.current.length : null;
  return (
    <>
      <div className={`card quiz ${flash ? 'quiz-ok' : ''}`} data-testid="quiz-card">
        <p className="hint">오선의 음을 보고 불어 보세요. 맞는 음이 0.4초 이상 나면 다음 문제로 넘어가요.</p>
        <div className="quiz-staff"><MiniStaff notes={[target]} width={150} /></div>
        <div className="quiz-status">{flash ?? (heard ? `지금 ${prettyName(heard.midi)}` : pitch.on ? '소리를 내 주세요' : '')}</div>
        {hint && (
          <div className="fg-top">
            <div className="fg-info"><div className="note-big small-big">{prettyName(target)}</div><div className="muted">{koName(target)}</div></div>
            <InstrumentDiagram keys={n.main.keys} size={110} compact />
          </div>
        )}
        <div className="session-controls">
          <button onClick={() => setHint(true)} disabled={hint}>힌트 (운지 보기)</button>
          <button onClick={() => playTone(midiToFreq(target, a4), 1.4)}>▶ 소리</button>
          <button onClick={() => { setScore((s) => ({ ...s, tries: s.tries + 1 })); setHint(false); setTarget((t) => pick(t)); t0.current = performance.now(); }}>건너뛰기</button>
        </div>
        {!pitch.on && <button className="primary wide" onClick={pitch.start}>마이크 켜고 시작</button>}
        {pitch.error && <p className="error">{pitch.error}</p>}
      </div>
      <div className="stats">
        <div><b>{score.ok}</b><span>맞힘</span></div>
        <div><b>{score.tries - score.ok}</b><span>건너뜀</span></div>
        <div><b>{avg === null ? '—' : `${avg.toFixed(1)}초`}</b><span>평균 걸린 시간</span></div>
      </div>
    </>
  );
}
