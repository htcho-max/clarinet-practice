import { useEffect, useMemo, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { drone, DRONE_PRESETS } from '../audio/drone';
import { NOTE_NAMES, NOTE_NAMES_KO, JUST_RATIOS, intervalName, freqToNote, justCents, midiToFreq, prettyName } from '../audio/notes';
import { equalRef, justRef, summarize } from '../audio/segment';
import { LongToneTracker, toneAdvice, type LongToneResult, type TonePoint } from '../audio/longtone';
import { EnvelopeTracker, findOnsets, scoreTonguing, tongueAdvice, type EnvPoint, type TongueResult } from '../audio/tonguing';
import { pitchTracker } from '../audio/pitchTracker';
import { resumeAudio } from '../audio/context';
import { noteClick } from '../audio/clicks';
import { CentsGauge, centsText } from '../components/CentsGauge';
import { CentsTrace } from '../components/CentsTrace';
import { FingeringDiagram } from '../components/FingeringDiagram';
import { fingeringFor } from '../clarinet/fingerings';
import { useSettings } from '../state/settings';
import { usePitch } from '../state/usePitch';
import { useAnalysis } from '../state/useAnalysis';
import { useAudioStatus, setAudioStatus } from '../state/audioStatus';
import { useWakeLock } from '../state/wakeLock';
import { db, type ToneRun } from '../data/db';
import { localDate } from '../data/dates';

type Mode = 'long' | 'tongue' | 'graph';
type Ref = 'equal' | 'just';

const fmt = (c: number | null) => (c === null ? '—' : centsText(c));
const tone = (c: number | null) => (c === null ? '' : Math.abs(c) <= 5 ? 'good' : Math.abs(c) <= 15 ? 'warn' : 'bad');
const koName = (midi: number) => NOTE_NAMES_KO[NOTE_NAMES[((midi % 12) + 12) % 12]];

function useToneRuns(kind: 'long' | 'tongue'): ToneRun[] {
  const [rows, setRows] = useState<ToneRun[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.toneRuns.where('kind').equals(kind).reverse().sortBy('createdAt')).subscribe({ next: setRows, error: () => {} });
    return () => sub.unsubscribe();
  }, [kind]);
  return rows;
}

export function Tone() {
  const { settings } = useSettings();
  const pitch = usePitch(settings.minDb);
  const { drone: dronePlaying } = useAudioStatus();
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem('clarinet-tone-mode') as Mode) || 'long'; } catch { return 'long'; } });
  useEffect(() => { try { localStorage.setItem('clarinet-tone-mode', mode); } catch { /* 무시 */ } }, [mode]);
  useWakeLock(dronePlaying || pitch.on, settings.wakeLock);
  const [root, setRoot] = useState(60);

  return (
    <section className="page tone">
      <div className="segmented">
        <button className={mode === 'long' ? 'on' : ''} onClick={() => setMode('long')} data-testid="mode-long">롱톤</button>
        <button className={mode === 'tongue' ? 'on' : ''} onClick={() => setMode('tongue')} data-testid="mode-tongue">텅잉</button>
        <button className={mode === 'graph' ? 'on' : ''} onClick={() => setMode('graph')} data-testid="mode-graph">음정·드론</button>
      </div>
      {mode !== 'tongue' && <DroneCard root={root} setRoot={setRoot} open={mode === 'graph' && !pitch.on} />}
      {mode === 'long' && <LongTone pitch={pitch} />}
      {mode === 'tongue' && <Tonguing pitch={pitch} />}
      {mode === 'graph' && <PitchGraph pitch={pitch} root={root} />}
    </section>
  );
}

function DroneCard({ root, setRoot, open }: { root: number; setRoot: (m: number) => void; open: boolean }) {
  const { settings, update } = useSettings();
  const { drone: playing } = useAudioStatus();
  const [fifth, setFifth] = useState(true);
  const a4 = settings.a4;
  const label = `${prettyName(root)}${fifth ? ' + 5도' : ''}`;
  async function play(r = root, f = fifth) {
    const base = midiToFreq(r, a4);
    const voices = [{ freq: base, gain: 1 }];
    if (f) voices.push({ freq: base * 1.5, gain: 0.6 });
    drone.volume = settings.droneVolume;
    await drone.start(voices);
    setAudioStatus({ drone: true, droneLabel: `${prettyName(r)}${f ? '+5' : ''}` });
  }
  function stopDrone() { drone.stop(); setAudioStatus({ drone: false }); }
  useEffect(() => { if (drone.playing) play(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [root, fifth, a4, settings.instrument]);
  useEffect(() => { drone.setVolume(settings.droneVolume); }, [settings.droneVolume]);
  const octave = Math.floor(root / 12) - 1;
  const pc = root % 12;
  return (
    <>
      <details className="card" open={open}>
        <summary className="card-summary"><b>드론</b> <span className="muted">{playing ? `켜짐 · ${label}` : '꺼짐'}</span></summary>
        <div className="chips">
          {DRONE_PRESETS.map((p) => (
            <button key={p.id} className={p.rootMidi === root ? 'chip on' : 'chip'} onClick={() => setRoot(p.rootMidi)}>{p.label}</button>
          ))}
        </div>
        <div className="note-grid">
          {NOTE_NAMES.map((n, i) => (
            <button key={n} className={i === pc ? 'chip on' : 'chip'} onClick={() => setRoot((octave + 1) * 12 + i)}>{n}</button>
          ))}
        </div>
        <div className="row-setting">
          <span>옥타브</span>
          {[3, 4, 5].map((o) => (
            <button key={o} className={o === octave ? 'chip on' : 'chip'} onClick={() => setRoot((o + 1) * 12 + pc)}>{o}</button>
          ))}
          <label><input type="checkbox" checked={fifth} onChange={(e) => setFifth(e.target.checked)} /> 5도 함께</label>
        </div>
        <div className="row-setting">
          <span>음량</span>
          <input type="range" min={0.05} max={0.8} step={0.05} value={settings.droneVolume} onChange={(e) => update({ droneVolume: Number(e.target.value) })} aria-label="드론 음량" />
        </div>
        <p className="hint">롱톤을 드론에 맞춰 불면 귀가 좋아져요. 음 이름은 악보음이고, 드론 소리는 악기 설정에 맞춰 실음으로 나와요.</p>
      </details>
      <button className={`secondary wide ${playing ? 'on' : ''}`} onClick={() => (playing ? stopDrone() : play())} data-testid="drone-toggle">
        {playing ? `■ 드론 끄기 (${label})` : `▶ 드론 켜기 (${label})`}
      </button>
    </>
  );
}

/* ---------------- 롱톤 ---------------- */

const LONG_NOTES = [67, 60, 64, 57, 55, 52, 71, 72];
const GOALS = [4, 8, 12, 16, 20];

function LongTone({ pitch }: { pitch: ReturnType<typeof usePitch> }) {
  const { settings } = useSettings();
  const [target, setTarget] = useState<number | null>(67);
  const [pattern, setPattern] = useState<'steady' | 'swell'>('steady');
  const [goal, setGoal] = useState(8);
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<LongToneResult | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const tracker = useRef(new LongToneTracker(settings.a4));
  const [, tick] = useState(0);
  const live = useRef<{ t: number; cents: number | null }[]>([]);
  const runs = useToneRuns('long');
  const today = localDate();
  const best = runs.reduce((a, r) => Math.max(a, r.durationSec ?? 0), 0);
  const bestToday = runs.filter((r) => r.date === today).reduce((a, r) => Math.max(a, r.durationSec ?? 0), 0);

  useEffect(() => { tracker.current = new LongToneTracker(settings.a4); }, [settings.a4]);
  useEffect(() => {
    if (!armed) return;
    const unsub = pitchTracker.subscribe((r) => {
      const done = tracker.current.push(r.time, r.freq, r.db);
      if (tracker.current.active) {
        live.current = tracker.current.points.map((p) => ({ t: p.t, cents: p.cents }));
      }
      if (done) finish(done);
      tick((x) => (x + 1) % 1e6);
    });
    return unsub;
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function finish(r: LongToneResult) {
    if (target !== null && r.midi !== target) {
      setSavedMsg(`${prettyName(r.midi)}로 불었어요 (목표 ${prettyName(target)}). 그래도 기록했어요.`);
    } else setSavedMsg(null);
    setResult(r);
    await db.toneRuns.add({
      createdAt: Date.now(), date: localDate(), kind: 'long', midi: r.midi, pattern, durationSec: Math.round(r.durationSec * 10) / 10,
      meanCents: Math.round(r.meanCents * 10) / 10, centsSD: Math.round(r.centsSD * 10) / 10, dbSD: Math.round(r.dbSD * 10) / 10,
      dbRange: Math.round(r.dbRange), centsPerDb: r.centsPerDb === null ? null : Math.round(r.centsPerDb * 100) / 100,
    });
  }
  async function start() {
    setResult(null); setSavedMsg(null);
    tracker.current.reset();
    live.current = [];
    if (!pitch.on) await pitch.start();
    setArmed(true);
  }
  function stop() {
    const r = tracker.current.finish();
    if (r) finish(r);
    setArmed(false);
  }

  const elapsed = tracker.current.active ? tracker.current.elapsed : 0;
  const curMidi = tracker.current.currentMidi;
  const lastCents = live.current.length ? live.current[live.current.length - 1].cents : null;
  const pct = Math.min(100, (elapsed / goal) * 100);
  const traceSrc = useMemo(() => ({ get current() { return live.current; } }), []);
  const fing = target !== null ? fingeringFor(target) : undefined;
  // 크레셴도 목표 모양 (지금 위치에서 얼마나 커야 하는지)
  const swellHint = pattern === 'swell' && armed && tracker.current.active
    ? (elapsed < goal / 2 ? '점점 크게 ↗' : elapsed < goal ? '점점 작게 ↘' : '끝! 조용히 마무리')
    : null;

  return (
    <>
      <div className="card">
        <b>음 고르기</b>
        <div className="chips">
          {LONG_NOTES.map((m) => <button key={m} className={`chip ${target === m ? 'on' : ''}`} onClick={() => setTarget(m)}>{prettyName(m)}</button>)}
          <button className={`chip ${target === null ? 'on' : ''}`} onClick={() => setTarget(null)}>아무 음</button>
        </div>
        <div className="segmented small">
          <button className={pattern === 'steady' ? 'on' : ''} onClick={() => setPattern('steady')}>일정하게</button>
          <button className={pattern === 'swell' ? 'on' : ''} onClick={() => setPattern('swell')} data-testid="pattern-swell">작게 → 크게 → 작게</button>
        </div>
        <div className="row-setting">
          <span>목표</span>
          {GOALS.map((g) => <button key={g} className={`chip ${goal === g ? 'on' : ''}`} onClick={() => setGoal(g)}>{g}초</button>)}
        </div>
        {fing && (
          <div className="tuner-fing">
            <FingeringDiagram keys={fing.main.keys} size={64} compact />
            <p className="hint">처음엔 열린 G(G4)나 C4처럼 편한 음으로. 숨을 크게 들이마시고, 배로 받치며 같은 속도로 내보내요. 소리가 끊기면 자동으로 끝나요.</p>
          </div>
        )}
      </div>

      <div className={`card longtone-live ${armed && tracker.current.active ? 'active' : ''}`} data-testid="longtone-live">
        <div className="lt-head">
          <div className="lt-time" data-testid="lt-time">{elapsed.toFixed(1)}<small>초</small></div>
          <div className="lt-note">
            <b>{curMidi !== null && armed ? prettyName(curMidi) : target !== null ? prettyName(target) : '—'}</b>
            <span className="muted small">{curMidi !== null && armed ? koName(curMidi) : armed ? '불어 주세요' : ''}</span>
          </div>
          <div className={`cents-num ${tone(lastCents)}`}>{fmt(lastCents)}<small> 센트</small></div>
        </div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        {swellHint && <div className="swell-hint">{swellHint}</div>}
        <CentsTrace source={traceSrc} seconds={Math.max(goal, 4)} range={30} height={110} labels={false} />
        {!armed ? (
          <button className="primary wide big" onClick={start} data-testid="lt-start">▶ 롱톤 시작</button>
        ) : (
          <button className="primary wide big stop" onClick={stop} data-testid="lt-stop">■ 그만</button>
        )}
        {pitch.error && <p className="error">{pitch.error}</p>}
        <div className="muted small">오늘 가장 길게 {bestToday ? `${bestToday.toFixed(1)}초` : '—'} · 지금까지 최고 {best ? `${best.toFixed(1)}초` : '—'}</div>
      </div>

      {result && (
        <div className="card" data-testid="lt-result">
          <div className="card-head"><b>결과 · {prettyName(result.midi)}</b><span className="muted small">{result.durationSec.toFixed(1)}초{result.durationSec >= goal ? ' · 목표 달성!' : ''}</span></div>
          {savedMsg && <p className="hint">{savedMsg}</p>}
          <div className="stats">
            <div><b className={tone(result.meanCents)}>{centsText(result.meanCents)}</b><span>평균 음정</span></div>
            <div><b>±{result.centsSD.toFixed(1)}</b><span>음정 흔들림</span></div>
            <div><b>{pattern === 'swell' ? `${Math.round(result.dbRange)}dB` : `±${result.dbSD.toFixed(1)}dB`}</b><span>{pattern === 'swell' ? '크기 변화 폭' : '크기 흔들림'}</span></div>
          </div>
          <ToneGraph points={result.points} />
          <ul className="advice">{toneAdvice(result, pattern).map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {runs.length > 0 && (
        <div className="card">
          <b>최근 롱톤</b>
          <table className="tbl">
            <thead><tr><th>날짜</th><th>음</th><th>길이</th><th>흔들림</th></tr></thead>
            <tbody>
              {runs.slice(0, 8).map((r) => (
                <tr key={r.id}><td>{r.date.slice(5)}</td><td>{r.midi !== undefined ? prettyName(r.midi) : '—'}{r.pattern === 'swell' ? ' ↗↘' : ''}</td><td>{r.durationSec?.toFixed(1)}초</td><td>±{r.centsSD}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** 롱톤 결과 그래프: 위 = 음정(센트), 아래 = 소리 크기 */
export function ToneGraph({ points }: { points: TonePoint[] }) {
  if (points.length < 2) return null;
  const W = 300, H = 120, t0 = points[0].t, T = Math.max(0.5, points[points.length - 1].t - t0);
  const x = (t: number) => ((t - t0) / T) * W;
  const yc = (c: number) => 30 - (Math.max(-30, Math.min(30, c)) / 30) * 26;
  const dbs = points.map((p) => p.db).filter((d) => isFinite(d));
  const dmin = Math.min(...dbs), dmax = Math.max(...dbs, dmin + 6);
  const yd = (d: number) => 112 - ((d - dmin) / (dmax - dmin)) * 40;
  const cl = points.filter((p) => p.cents !== null).map((p) => `${x(p.t).toFixed(1)},${yc(p.cents!).toFixed(1)}`).join(' ');
  const dl = points.filter((p) => isFinite(p.db)).map((p) => `${x(p.t).toFixed(1)},${yd(p.db).toFixed(1)}`).join(' ');
  return (
    <svg className="tone-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="음정과 소리 크기 그래프">
      <rect x={0} y={yc(5)} width={W} height={yc(-5) - yc(5)} className="zone-good" />
      <line x1={0} x2={W} y1={yc(0)} y2={yc(0)} className="axis" />
      <text x={2} y={9} className="g-label">음정 ±30센트</text>
      <polyline points={cl} className="line-cents" />
      <text x={2} y={70} className="g-label">소리 크기</text>
      <polyline points={dl} className="line-db" />
    </svg>
  );
}

/* ---------------- 텅잉 ---------------- */

const PER_BEAT = [
  { n: 1, label: '4분음표' },
  { n: 2, label: '8분음표' },
  { n: 3, label: '셋잇단' },
  { n: 4, label: '16분음표' },
];

function Tonguing({ pitch }: { pitch: ReturnType<typeof usePitch> }) {
  const { settings } = useSettings();
  const runs = useToneRuns('tongue');
  const [bpm, setBpm] = useState(() => { try { return Number(localStorage.getItem('clarinet-tongue-bpm')) || 60; } catch { return 60; } });
  const [perBeat, setPerBeat] = useState(() => { try { return Number(localStorage.getItem('clarinet-tongue-per')) || 2; } catch { return 2; } });
  const [bars, setBars] = useState(2);
  const [clickAll, setClickAll] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'count' | 'play' | 'done'>('idle');
  const [beatNow, setBeatNow] = useState(-1);
  const [result, setResult] = useState<TongueResult | null>(null);
  const env = useRef<EnvPoint[]>([]);
  const tracker = useRef<EnvelopeTracker | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nodes = useRef<OscillatorNode[]>([]);
  useEffect(() => { try { localStorage.setItem('clarinet-tongue-bpm', String(bpm)); localStorage.setItem('clarinet-tongue-per', String(perBeat)); } catch { /* 무시 */ } }, [bpm, perBeat]);
  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function cleanup() {
    timers.current.forEach(clearTimeout); timers.current = [];
    nodes.current.forEach((n) => { try { n.stop(); } catch { /* 이미 끝남 */ } }); nodes.current = [];
    tracker.current?.stop(); tracker.current = null;
  }

  async function start() {
    cleanup();
    setResult(null);
    if (!pitch.on) await pitch.start();
    if (!pitchTracker.running) return;
    const ctx = await resumeAudio();
    const beat = 60 / bpm;
    const t0 = ctx.currentTime + 0.3;
    const first = t0 + 4 * beat; // 한 마디 세고 시작
    const beats = bars * 4;
    const count = beats * perBeat;
    const end = first + beats * beat;
    // 클릭 예약
    const totalClicks = clickAll ? 4 + beats : 4;
    for (let k = 0; k < totalClicks; k++) {
      const t = t0 + k * beat;
      const osc = ctx.createOscillator();
      osc.frequency.value = k % 4 === 0 ? 1760 : 1320;
      const g = ctx.createGain();
      g.gain.setValueAtTime(k < 4 ? 0.35 : 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.05);
      nodes.current.push(osc);
      noteClick(t);
    }
    // 화면 박 표시
    for (let k = 0; k < 4 + beats; k++) {
      timers.current.push(setTimeout(() => { setBeatNow(k); setPhase(k < 4 ? 'count' : 'play'); }, (t0 + k * beat - ctx.currentTime) * 1000));
    }
    env.current = [];
    tracker.current = new EnvelopeTracker();
    tracker.current.start((p) => { env.current.push(...p); });
    setPhase('count');
    timers.current.push(setTimeout(() => {
      tracker.current?.stop(); tracker.current = null;
      const ons = findOnsets(env.current, { floorDb: settings.minDb });
      const r = scoreTonguing(ons, first, bpm, perBeat, count);
      setResult(r);
      setPhase('done');
      setBeatNow(-1);
      if (r.hits >= 2) {
        db.toneRuns.add({ createdAt: Date.now(), date: localDate(), kind: 'tongue', bpm, perBeat, hits: r.hits, expected: r.expected,
          meanAbsMs: r.meanAbsMs === null ? null : Math.round(r.meanAbsMs), evenPct: r.evenPct === null ? null : Math.round(r.evenPct * 10) / 10 });
      }
    }, (end + 0.35 - ctx.currentTime) * 1000));
  }
  function cancel() { cleanup(); setPhase('idle'); setBeatNow(-1); }

  const passed = result && result.hits >= result.expected * 0.9 && result.extra <= 2 && (result.meanAbsMs ?? 99) <= 35 && (result.evenPct ?? 99) <= 12;
  const busy = phase === 'count' || phase === 'play';
  return (
    <>
      <div className="card">
        <b>설정</b>
        <div className="row-setting">
          <span>♩</span>
          <button className="mini" onClick={() => setBpm(Math.max(40, bpm - 4))} disabled={busy}>−</button>
          <b data-testid="tongue-bpm">{bpm}</b>
          <button className="mini" onClick={() => setBpm(Math.min(160, bpm + 4))} disabled={busy}>＋</button>
          <select value={bars} onChange={(e) => setBars(Number(e.target.value))} disabled={busy} aria-label="마디 수">
            <option value={1}>1마디</option><option value={2}>2마디</option><option value={4}>4마디</option>
          </select>
        </div>
        <div className="segmented small">
          {PER_BEAT.map((p) => <button key={p.n} className={perBeat === p.n ? 'on' : ''} onClick={() => setPerBeat(p.n)} disabled={busy}>{p.label}</button>)}
        </div>
        <label className="small"><input type="checkbox" checked={clickAll} onChange={(e) => setClickAll(e.target.checked)} disabled={busy} /> 끝까지 클릭 듣기 (이어폰 권장 — 스피커 클릭은 어택과 헷갈릴 수 있어요)</label>
        <p className="hint">편한 음 하나(열린 G, C4 등)로 "투-투-투" 혀끝을 리드에 댔다 떼며 박에 맞춰 불어요. 한 마디 세는 소리 뒤에 시작해요. 숨은 끊지 말고 혀로만 음을 나눠요.</p>
      </div>

      <div className="card tongue-live" data-testid="tongue-live">
        <div className="beat-dots">
          {Array.from({ length: 4 + bars * 4 }, (_, k) => (
            <span key={k} className={`dot ${k < 4 ? 'count' : ''} ${k === beatNow ? 'now' : ''} ${k < beatNow ? 'past' : ''}`} />
          ))}
        </div>
        <div className="tongue-phase">{phase === 'count' ? `준비… ${Math.max(1, 4 - beatNow)}` : phase === 'play' ? '지금 불어요!' : phase === 'done' ? '끝' : ' '}</div>
        {!busy ? (
          <button className="primary wide big" onClick={start} data-testid="tongue-start">▶ 시작 (♩={bpm})</button>
        ) : (
          <button className="primary wide big stop" onClick={cancel}>■ 그만</button>
        )}
        {pitch.error && <p className="error">{pitch.error}</p>}
      </div>

      {result && (
        <div className="card" data-testid="tongue-result">
          <div className="card-head"><b>결과</b>{passed && <span className="badge">통과 · 다음엔 ♩={bpm + 4}</span>}</div>
          <div className="stats">
            <div><b data-testid="tongue-hits">{result.hits}/{result.expected}</b><span>맞춘 음</span></div>
            <div><b>{result.meanAbsMs === null ? '—' : `${Math.round(result.meanAbsMs)}ms`}</b><span>박과 어긋남</span></div>
            <div><b>{result.evenPct === null ? '—' : `${Math.round(result.evenPct)}%`}</b><span>간격 흔들림</span></div>
          </div>
          <TongueTimeline r={result} />
          <ul className="advice">{tongueAdvice(result).map((a) => <li key={a}>{a}</li>)}</ul>
          {passed && <button className="secondary" onClick={() => setBpm(Math.min(160, bpm + 4))}>템포 올리기 (♩={bpm + 4})</button>}
        </div>
      )}

      {runs.length > 0 && (
        <div className="card">
          <b>최근 텅잉</b>
          <table className="tbl">
            <thead><tr><th>날짜</th><th>템포</th><th>맞춤</th><th>어긋남</th></tr></thead>
            <tbody>
              {runs.slice(0, 8).map((r) => (
                <tr key={r.id}><td>{r.date.slice(5)}</td><td>♩{r.bpm} · {PER_BEAT.find((p) => p.n === r.perBeat)?.label}</td><td>{r.hits}/{r.expected}</td><td>{r.meanAbsMs ?? '—'}ms</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** 목표 박(눈금)과 실제 어택(점) */
function TongueTimeline({ r }: { r: TongueResult }) {
  const W = 300, H = 46;
  const last = r.grid[r.grid.length - 1]?.t ?? 1;
  const x = (t: number) => 8 + (t / Math.max(0.1, last)) * (W - 16);
  return (
    <svg className="tongue-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="박과 어택">
      <line x1={4} x2={W - 4} y1={23} y2={23} className="axis" />
      {r.grid.map((g, i) => (
        <g key={i}>
          <line x1={x(g.t)} x2={x(g.t)} y1={12} y2={34} className="tick" />
          {g.hit !== null
            ? <circle cx={x(g.hit)} cy={23} r={3.6} className={Math.abs(g.hit - g.t) * 1000 <= 25 ? 'hit good' : Math.abs(g.hit - g.t) * 1000 <= 50 ? 'hit warn' : 'hit bad'} />
            : <text x={x(g.t)} y={44} className="miss" textAnchor="middle">×</text>}
        </g>
      ))}
    </svg>
  );
}

/* ---------------- 음정 그래프 (드론 기준) ---------------- */

function PitchGraph({ pitch, root }: { pitch: ReturnType<typeof usePitch>; root: number }) {
  const { settings } = useSettings();
  const { drone: playing } = useAudioStatus();
  const [refMode, setRefMode] = useState<Ref>('just');
  const a4 = settings.a4;
  const rootFreq = midiToFreq(root, a4);
  const useJust = refMode === 'just' && playing;
  const reference = useMemo(() => (useJust ? justRef(root, a4, JUST_RATIOS) : equalRef(a4)), [useJust, root, a4]);
  const an = useAnalysis(reference);
  const freq = pitch.reading?.freq ?? null;
  const note = freq ? freqToNote(freq, a4) : null;
  const jc = freq ? justCents(freq, rootFreq) : null;
  const cents = useJust ? jc?.cents ?? null : note?.cents ?? null;
  const summary = summarize(an.notes);
  return (
    <>
      <div className="card">
        <div className="card-head">
          <b>내 음정</b>
          <div className="segmented small">
            <button className={refMode === 'just' ? 'on' : ''} onClick={() => setRefMode('just')}>드론 기준 순정률</button>
            <button className={refMode === 'equal' ? 'on' : ''} onClick={() => setRefMode('equal')}>평균율</button>
          </div>
        </div>
        {refMode === 'just' && !playing && <p className="hint">드론을 켜면 드론 기준 순정률로 계산해요. 지금은 평균율이에요.</p>}
        <div className="drone-reading">
          <span className="note-mid">{note ? prettyName(note.midi) : '—'}</span>
          <span className="muted">{note ? `${koName(note.midi)}${useJust && jc ? ` · 드론에서 ${intervalName(jc.semis, jc.octave)}` : ''}` : pitch.on ? '소리를 내 주세요' : ''}</span>
          <span className="cents-num">{centsText(cents)}<small> 센트</small></span>
        </div>
        <CentsGauge cents={cents} />
        <button className={`secondary wide ${pitch.on ? 'on' : ''}`} onClick={pitch.on ? pitch.stop : pitch.start} data-testid="mic-toggle">
          {pitch.on ? '마이크 끄기' : '마이크 켜고 음정 보기'}
        </button>
        {pitch.error && <p className="error">{pitch.error}</p>}
      </div>
      <div className="card">
        <div className="card-head"><b>최근 10초</b><button className="mini" onClick={an.reset}>지우기</button></div>
        <CentsTrace source={an.trace} seconds={10} testId="trace" />
        <b>음별 평균 오차</b>
        {summary.length === 0 ? <p className="muted small">음을 0.15초 이상 내면 여기에 쌓여요. 음계를 천천히 불어 보세요.</p> : (
          <table className="tbl" data-testid="note-summary">
            <thead><tr><th>음</th><th>평균</th><th>횟수</th></tr></thead>
            <tbody>
              {summary.slice(0, 12).map((s) => (
                <tr key={s.midi}><td>{prettyName(s.midi)}</td><td className={tone(s.meanCents)}>{fmt(s.meanCents)}</td><td>{s.count}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">클라리넷은 음마다 음정 버릇이 달라요. 흔히 스로트 음(G♯4~B♭4)은 높게 나오기 쉬워요. 내 악기에서 어느 음이 늘 벗어나는지 여기서 확인하세요.</p>
      </div>
    </>
  );
}
