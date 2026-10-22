import { useToday } from '../state/useToday';
import { useEffect, useRef, useState } from 'react';
import { pitchTracker } from '../audio/pitchTracker';
import { NoteSegmenter, equalRef } from '../audio/segment';
import { prettyName } from '../audio/notes';
import { planPlayback, scorePlayer } from '../score/player';
import type { ParsedScore, ScoreNote } from '../score/parse';
import { ECHO_POOLS, makePhrase, scoreEcho, nextLength, rng, type EchoResult } from '../exercise/echo';
import { MiniStaff } from '../components/MiniStaff';
import { P } from '../instruments/profiles';
import { useSettings } from '../state/settings';
import type { usePitch } from '../state/usePitch';
import { useToneRuns } from '../state/useToneRuns';
import { db } from '../data/db';
import { localDate } from '../data/dates';

const POOLS = ECHO_POOLS[P.id];
const BPM = 72;
type Phase = 'idle' | 'play' | 'listen' | 'done';

/** 악구를 악보처럼 만들어서 악기 소리로 재생 (4분음표, 실음으로) */
function phraseScore(notes: number[]): ParsedScore {
  const ns: ScoreNote[] = notes.map((midi, i) => ({ measure: 1, index: i, midi, beat: i, dur: 1 }));
  return { title: '', measures: [1], notes: ns, measureLen: new Map([[1, notes.length]]), time: [notes.length, 4], parts: [''], transpose: 0, bars: [] };
}

export function EchoTrainer({ pitch }: { pitch: ReturnType<typeof usePitch> }) {
  const { settings } = useSettings();
  const [poolId, setPoolId] = useState(() => { try { return localStorage.getItem('clarinet-echo-pool') || POOLS[0].id; } catch { return POOLS[0].id; } });
  useEffect(() => { try { localStorage.setItem('clarinet-echo-pool', poolId); } catch { /* 무시 */ } }, [poolId]);
  const pool = POOLS.find((p) => p.id === poolId) ?? POOLS[0];
  const [len, setLen] = useState(3);
  const [showStaff, setShowStaff] = useState(false);
  const [phrase, setPhrase] = useState<number[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState<number[]>([]);
  const [res, setRes] = useState<EchoResult | null>(null);
  const [tally, setTally] = useState({ right: 0, tries: 0 });
  const hist = useRef<boolean[]>([]);
  const halfFails = useRef(0);
  const seed = useRef(Date.now() % 100000);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  const runs = useToneRuns('echo');
  const today = useToday();
  const todayRuns = runs.filter((r) => r.date === today);
  useEffect(() => () => { scorePlayer.stop(); if (timer.current) clearTimeout(timer.current); }, []);

  async function play(p: number[]) {
    setPhase('play'); setHeard([]); setRes(null);
    if (!pitch.on) await pitch.start(); // 마이크 권한은 먼저 (듣는 동안 묻지 않게)
    const plan = planPlayback(phraseScore(p), { bpm: BPM, from: 1, to: 1, countIn: false });
    await scorePlayer.play(plan, {
      a4: settings.a4, click: false, voice: 'sample', reverb: false,
      // 앱 소리의 끝자락을 듣지 않게 잠깐 쉬고 듣기
      onEnd: () => { timer.current = setTimeout(() => setPhase('listen'), 350); },
    });
  }
  function newPhrase() {
    seed.current += 1;
    const p = makePhrase(pool.notes, len, rng(seed.current));
    setPhrase(p);
    void play(p);
  }

  // 듣기: 음 단위로 모아서, 소리가 0.9초 끊기면 끝
  useEffect(() => {
    if (phase !== 'listen' || !phrase) return;
    const seg = new NoteSegmenter(equalRef(settings.a4));
    const got: number[] = [];
    let t0: number | null = null, last: number | null = null;
    let ended = false;
    const end = () => {
      if (ended) return; ended = true;
      const f = seg.flush(); if (f) got.push(f.midi);
      endRef.current = null;
      finish(got);
    };
    endRef.current = end;
    const unsub = pitchTracker.subscribe((r) => {
      if (t0 === null) t0 = r.time;
      if (r.freq !== null) last = r.time;
      const n = seg.push(r.time, r.freq);
      if (n) { got.push(n.midi); setHeard([...got]); }
      if (last !== null && r.freq === null && r.time - last > 0.9) end();
      else if (last === null && r.time - t0 > 8) end();
      else if (got.length >= phrase.length + 3) end();
    });
    return () => { unsub(); endRef.current = null; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(got: number[]) {
    if (!phrase) return;
    const r = scoreEcho(phrase, got);
    setRes(r); setHeard(got); setPhase('done');
    setTally((t) => ({ right: t.right + (r.perfect ? 1 : 0), tries: t.tries + 1 }));
    hist.current.push(r.perfect);
    halfFails.current = r.correct < phrase.length / 2 ? halfFails.current + 1 : 0;
    const nl = nextLength(len, hist.current, halfFails.current);
    if (nl !== len) { setLen(nl); hist.current = []; halfFails.current = 0; }
    if (got.length) void db.toneRuns.add({ createdAt: Date.now(), date: localDate(), kind: 'echo', hits: r.correct, expected: phrase.length, phraseLen: phrase.length, pool: pool.id, midi: phrase[0] });
  }
  /** 다 불었다고 누르면 지금까지 들은 것으로 */
  const stopListen = () => endRef.current?.();
  const busy = phase === 'play' || phase === 'listen';

  return (
    <>
      <div className="card">
        <b>듣고 따라 불기</b>
        <div className="chips">
          {POOLS.map((p) => <button key={p.id} className={`chip ${p.id === pool.id ? 'on' : ''}`} disabled={busy} onClick={() => { setPoolId(p.id); setPhrase(null); setRes(null); }}>{p.label}</button>)}
        </div>
        <div className="row-setting">
          <span>음 개수</span>
          <button className="mini" disabled={busy || len <= 2} onClick={() => { setLen(len - 1); hist.current = []; }} aria-label="음 줄이기">−</button>
          <b data-testid="echo-len">{len}</b>
          <button className="mini" disabled={busy || len >= 6} onClick={() => { setLen(len + 1); hist.current = []; }} aria-label="음 늘리기">+</button>
          <label><input type="checkbox" checked={showStaff} onChange={(e) => setShowStaff(e.target.checked)} /> 악보 먼저 보기</label>
        </div>
        <p className="hint">앱이 짧은 악구를 들려주면 똑같이 불어요. 3번 연속 다 맞히면 한 음 늘고, 두 번 연속 절반도 못 맞히면 한 음 줄어요. 귀로 음을 찾는 연습이라 처음엔 "{POOLS[0].label}"처럼 좁게 시작하세요.</p>
      </div>

      <div className="card echo-live" data-testid="echo-live">
        {phrase && (showStaff || phase === 'done') ? <MiniStaff notes={phrase} width={Math.max(180, 60 + phrase.length * 40)} /> : (
          <div className="echo-dots">{Array.from({ length: phrase?.length ?? len }, (_, i) => <span key={i} className={`dot ${i < heard.length ? 'past' : ''}`} />)}</div>
        )}
        <div className="tongue-phase" data-testid="echo-phase">{phase === 'play' ? '잘 들어 보세요…' : phase === 'listen' ? '지금 따라 불어요!' : phase === 'done' ? (res?.perfect ? '정답!' : `${res?.correct}/${phrase?.length} 맞음`) : ' '}</div>
        {phase === 'listen' && <div className="echo-heard">{heard.map((m, i) => <span key={i} className="chip">{prettyName(m)}</span>)}</div>}
        {res && phrase && (
          <table className="tbl echo-table" data-testid="echo-result">
            <tbody>
              <tr><th>정답</th>{phrase.map((m, i) => <td key={i} className={res.marks[i] === 'ok' ? 'good' : 'bad'}>{prettyName(m)}</td>)}</tr>
              <tr><th>내 소리</th>{phrase.map((_, i) => <td key={i} className="muted">{res.played[i] !== undefined ? prettyName(res.played[i]) : '—'}</td>)}</tr>
            </tbody>
          </table>
        )}
        {phase === 'listen' ? (
          <button className="primary wide big stop" onClick={stopListen} data-testid="echo-stop">■ 다 불었어요</button>
        ) : (
          <div className="session-controls">
            <button className="primary" onClick={newPhrase} disabled={busy} data-testid="echo-new">▶ {phrase ? '다음 문제' : '문제 듣기'}</button>
            <button onClick={() => phrase && play(phrase)} disabled={busy || !phrase} data-testid="echo-again">↻ 다시 듣기</button>
          </div>
        )}
        {pitch.error && <p className="error">{pitch.error}</p>}
        <div className="muted small">이번에 {tally.right}/{tally.tries} 정답 · 오늘 {todayRuns.filter((r) => r.hits === r.expected).length}/{todayRuns.length}</div>
      </div>
    </>
  );
}
