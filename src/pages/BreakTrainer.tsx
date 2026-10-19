import { useEffect, useRef, useState } from 'react';
import { pitchTracker } from '../audio/pitchTracker';
import { equalRef } from '../audio/segment';
import { prettyName } from '../audio/notes';
import { analyzeBreak, breakAdvice, CLEAN_GAP_MS, type BreakFrame, type BreakResult, type Crossing } from '../audio/breakCross';
import { InstrumentDiagram } from '../components/InstrumentDiagram';
import { P, fingeringFor } from '../instruments/profiles';
import { useSettings } from '../state/settings';
import type { usePitch } from '../state/usePitch';
import { useToneRuns } from '../state/useToneRuns';
import { currentGearId } from '../state/useGear';
import { db } from '../data/db';
import { localDate } from '../data/dates';

/** 넘기 연습 짝 (악보음 midi) */
const PAIRS: { lo: number; hi: number; label: string; tip: string }[] = P.id === 'flute' ? [
  { lo: 73, hi: 74, label: 'C♯5 ↔ D5', tip: '거의 모든 손가락이 바뀌어요. 한꺼번에, 숨은 그대로.' },
  { lo: 72, hi: 74, label: 'C5 ↔ D5', tip: '왼손 검지를 떼고 붙이는 순간을 정확히.' },
  { lo: 64, hi: 76, label: 'E4 ↔ E5 (옥타브)', tip: '운지는 같아요. 입술 구멍을 작게, 바람을 빠르게 해서 올라가요.' },
  { lo: 67, hi: 79, label: 'G4 ↔ G5 (옥타브)', tip: '턱을 움직이지 말고 바람 속도와 방향만 살짝.' },
] : [
  { lo: 69, hi: 71, label: 'A4 ↔ B4 (브레이크)', tip: '오른손 손가락과 링을 미리 덮어 둔 채로 A키만 떼고 누르는 연습부터. 레지스터 키와 손가락을 동시에.' },
  { lo: 70, hi: 72, label: 'B♭4 ↔ C5', tip: '왼손 엄지는 구멍을 막은 채 레지스터 키만 굴리듯이.' },
  { lo: 67, hi: 74, label: 'G4 ↔ D5', tip: '열린 G 에서 손가락을 한꺼번에 내려요. 숨이 끊기지 않게.' },
  { lo: 69, hi: 72, label: 'A4 ↔ C5', tip: '바람을 계속 보내고 손가락만 바꿔요. 턱은 그대로.' },
  { lo: 55, hi: 74, label: 'G3 ↔ D5 (12도)', tip: '운지는 그대로, 레지스터 키만. 입술을 조이지 말고 숨 속도로 올라가요.' },
];
const GOALS = [10, 20, 30];

export function BreakTrainer({ pitch }: { pitch: ReturnType<typeof usePitch> }) {
  const { settings } = useSettings();
  const [pi, setPi] = useState(() => { try { return Math.min(PAIRS.length - 1, Number(localStorage.getItem('clarinet-break-pair')) || 0); } catch { return 0; } });
  useEffect(() => { try { localStorage.setItem('clarinet-break-pair', String(pi)); } catch { /* 무시 */ } }, [pi]);
  const [goal, setGoal] = useState(10);
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState<BreakResult | null>(null);
  const [result, setResult] = useState<BreakResult | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const frames = useRef<BreakFrame[]>([]);
  const active = useRef(false);
  const runs = useToneRuns('break');
  const pair = PAIRS[pi];

  useEffect(() => {
    if (!armed) return;
    const ref = equalRef(settings.a4);
    let k = 0;
    const unsub = pitchTracker.subscribe((r) => {
      // 넘기는 끊김 시간을 재야 하니, 잠깐의 끊김을 메우는 freq 대신 짧은 창의 raw 값으로
      let m: number | null = null;
      if (r.raw !== null) { const x = ref(r.raw); m = x.midi + x.cents / 100; }
      frames.current.push({ t: r.time, m });
      if (++k % 6 === 0) {
        setNow(m === null ? null : Math.round(m));
        const a = analyzeBreak(frames.current, pair.lo, pair.hi);
        setLive(a);
        if (a.crossings.length >= goal) finish();
      }
    });
    return unsub;
  }, [armed, pi, goal, settings.a4]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setResult(null); setLive(null); frames.current = [];
    if (!pitch.on) await pitch.start();
    if (!pitchTracker.running) return;
    active.current = true;
    setArmed(true);
  }
  function finish() {
    if (!active.current) return; // 두 번 끝나지 않게
    active.current = false;
    setArmed(false);
    const r = analyzeBreak(frames.current, pair.lo, pair.hi);
    setResult(r);
    setNow(null);
    if (r.crossings.length >= 2) {
      void currentGearId().then((gearId) => db.toneRuns.add({
        createdAt: Date.now(), date: localDate(), kind: 'break', midi: pair.lo, midi2: pair.hi,
        hits: r.crossings.length, clean: r.clean, squeaks: r.squeaks, gapMs: r.meanGapMs, gearId,
      }));
    }
  }
  const lo = fingeringFor(pair.lo), hi = fingeringFor(pair.hi);
  const shown = result ?? live;
  const lastGap = live?.crossings.length ? live.crossings[live.crossings.length - 1] : null;

  return (
    <>
      <div className="card">
        <b>{P.id === 'flute' ? '넘기 연습' : '브레이크 넘기'}</b>
        <div className="chips">
          {PAIRS.map((p, i) => <button key={p.label} className={`chip ${i === pi ? 'on' : ''}`} disabled={armed} onClick={() => setPi(i)}>{p.label}</button>)}
        </div>
        <div className="row-setting">
          <span>목표</span>
          {GOALS.map((g) => <button key={g} className={`chip ${goal === g ? 'on' : ''}`} disabled={armed} onClick={() => setGoal(g)}>{g}번</button>)}
        </div>
        <div className="break-fing">
          {lo && <div><InstrumentDiagram keys={lo.main.keys} size={64} compact /><b>{prettyName(pair.lo)}</b></div>}
          <span className="break-arrow">⇄</span>
          {hi && <div><InstrumentDiagram keys={hi.main.keys} size={64} compact /><b>{prettyName(pair.hi)}</b></div>}
        </div>
        <p className="hint">{pair.tip} 두 음을 0.2초 이상씩 번갈아 불면, 넘어가는 사이에 소리가 끊긴 시간과 끽 소리를 재요.</p>
      </div>

      <div className={`card break-live ${armed ? 'active' : ''}`} data-testid="break-live">
        <div className="lt-head">
          <div className="lt-time"><span data-testid="break-count">{live?.crossings.length ?? 0}</span><small>/{goal}번</small></div>
          <div className="lt-note"><b>{armed && now !== null ? prettyName(now) : '—'}</b><span className="muted small">{armed ? (now === null ? '불어 주세요' : now === pair.lo || now === pair.hi ? '' : '다른 음') : ''}</span></div>
          <div className={`cents-num ${lastGap ? gapTone(lastGap) : ''}`}>{lastGap ? (lastGap.squeak ? '끽!' : `${lastGap.gapMs}`) : '—'}<small>{lastGap && !lastGap.squeak ? ' ms' : ''}</small></div>
        </div>
        <div className="progress"><div style={{ width: `${Math.min(100, ((live?.crossings.length ?? 0) / goal) * 100)}%` }} /></div>
        {shown && shown.crossings.length > 0 && <CrossingBars cs={shown.crossings} />}
        {!armed ? (
          <button className="primary wide big" onClick={start} data-testid="break-start">▶ 넘기 시작</button>
        ) : (
          <button className="primary wide big stop" onClick={finish} data-testid="break-stop">■ 그만</button>
        )}
        {pitch.error && <p className="error">{pitch.error}</p>}
      </div>

      {result && (
        <div className="card" data-testid="break-result">
          <div className="card-head"><b>결과 · {pair.label}</b><span className="muted small">점수 {result.score}</span></div>
          <div className="stats">
            <div><b data-testid="break-clean">{result.clean}/{result.crossings.length}</b><span>깨끗하게 ({CLEAN_GAP_MS}ms 안)</span></div>
            <div><b>{result.up.meanGapMs ?? '—'}<small>ms</small></b><span>올라갈 때 끊김</span></div>
            <div><b>{result.down.meanGapMs ?? '—'}<small>ms</small></b><span>내려올 때 끊김</span></div>
          </div>
          {result.squeaks > 0 && <p className="bad small"><b>끽 소리 {result.squeaks}번</b></p>}
          <ul className="advice">{breakAdvice(result, P.id).map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {runs.length > 0 && (
        <div className="card">
          <b>최근 넘기</b>
          <table className="tbl">
            <thead><tr><th>날짜</th><th>음</th><th>깨끗</th><th>끊김</th></tr></thead>
            <tbody>
              {runs.slice(0, 8).map((r) => (
                <tr key={r.id}><td>{r.date.slice(5)}</td><td>{r.midi !== undefined ? prettyName(r.midi) : ''}↔{r.midi2 !== undefined ? prettyName(r.midi2) : ''}</td><td>{r.clean ?? 0}/{r.hits}{r.squeaks ? ` · 끽${r.squeaks}` : ''}</td><td>{r.gapMs ?? '—'}ms</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const gapTone = (c: Crossing) => (c.squeak || c.stray ? 'bad' : c.gapMs <= CLEAN_GAP_MS ? 'good' : c.gapMs <= 150 ? 'warn' : 'bad');

/** 넘을 때마다 막대 하나 (높이 = 끊긴 시간, 색 = 깨끗함) */
function CrossingBars({ cs }: { cs: Crossing[] }) {
  const list = cs.slice(-30);
  const W = 300, H = 56, bw = W / Math.max(10, list.length);
  return (
    <svg className="crossing-bars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`넘기 ${cs.length}번`}>
      <line x1={0} x2={W} y1={H - (CLEAN_GAP_MS / 300) * H} y2={H - (CLEAN_GAP_MS / 300) * H} className="axis" />
      {list.map((c, i) => {
        const h = c.squeak ? H : Math.max(3, Math.min(1, c.gapMs / 300) * H);
        return <rect key={i} x={i * bw + 1} y={H - h} width={Math.max(2, bw - 2)} height={h} className={`bar ${gapTone(c)}`}><title>{c.dir === 'up' ? '↑' : '↓'} {c.squeak ? '끽 소리' : `${c.gapMs}ms`}</title></rect>;
      })}
    </svg>
  );
}
